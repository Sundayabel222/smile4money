/**
 * Dead-letter queue (DLQ) for failed oracle submissions.
 *
 * Failed submissions are stored via a pluggable persistent store (in-memory by
 * default; swap to SQLite or MongoDB via the QUEUE_STORE env var). A retry
 * worker periodically attempts to reprocess each entry and emits
 * `oracle_dlq_depth` for monitoring.
 *
 * Circuit breaker pattern protects against cascading RPC failures:
 * - After N consecutive failures, job processing is paused
 * - Backoff cooldown prevents hammering a degraded endpoint
 * - Automatic recovery testing after cooldown expires
 */

import { getCircuitBreaker, CircuitState } from './services/circuit-breaker.js';
import { InMemoryQueueStore } from './store/in-memory-queue-store.js';
import type { DlqEntry, PersistentQueueStore } from './store/persistent-queue-store.js';

export type { DlqEntry };

// Simple structured logger (avoids circular dependency on logger.ts)
const logger = {
  info: (context: object, message: string) =>
    console.log(JSON.stringify({ level: 'info', message, ...context })),
  warn: (context: object, message: string) =>
    console.warn(JSON.stringify({ level: 'warn', message, ...context })),
  error: (context: object, message: string) =>
    console.error(JSON.stringify({ level: 'error', message, ...context })),
};

let queueStore: PersistentQueueStore | null = null;

/**
 * Initialise the queue store based on the QUEUE_STORE environment variable.
 * Must be called once on application startup before any other queue function.
 *
 * QUEUE_STORE values:
 *   memory | auto (default) → InMemoryQueueStore
 */
export async function initializeQueue(): Promise<void> {
  const storeType = process.env.QUEUE_STORE || 'auto';

  if (storeType === 'memory' || storeType === 'auto') {
    queueStore = new InMemoryQueueStore();
  } else {
    // Future: resolve SQLite / MongoDB stores here
    queueStore = new InMemoryQueueStore();
  }

  await queueStore.initialize();
  logger.info({}, 'oracle_dlq: queue store initialized');
}

/**
 * Return the active queue store.
 * @throws if initializeQueue() has not been called yet.
 */
function getQueueStore(): PersistentQueueStore {
  if (!queueStore) {
    throw new Error('Queue store not initialized. Call initializeQueue() first.');
  }
  return queueStore;
}

/** Write a failed submission to the DLQ. */
export async function writeToDlq(
  payload: unknown,
  failureReason: string,
): Promise<DlqEntry> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: DlqEntry = {
    id,
    payload,
    failureReason,
    attempts: 0,
    createdAt: Date.now(),
    lastAttemptAt: null,
  };

  await getQueueStore().add(entry);
  logger.warn({ dlqId: id, failureReason }, 'oracle_dlq: entry written');
  await emitDlqDepth();
  return entry;
}

/** Return all pending DLQ entries (shallow copy). */
export async function listDlqEntries(): Promise<DlqEntry[]> {
  return await getQueueStore().getAll();
}

/** Remove a successfully processed entry. */
export async function removeDlqEntry(id: string): Promise<void> {
  await getQueueStore().remove(id);
  await emitDlqDepth();
}

/** Update an entry's retry state. */
export async function updateDlqEntry(
  id: string,
  updates: Partial<DlqEntry>,
): Promise<void> {
  await getQueueStore().update(id, updates);
}

/** Emit the oracle_dlq_depth metric. */
async function emitDlqDepth(): Promise<void> {
  const depth = await getQueueStore().count();
  logger.info({ metric: 'oracle_dlq_depth', value: depth }, 'oracle_dlq_depth');
}

export type RetryHandler = (entry: DlqEntry) => Promise<void>;

/**
 * Start the DLQ retry worker. Call once on startup.
 * Returns a cleanup function that stops the worker.
 *
 * Implements a circuit breaker to prevent cascading failures:
 * - Circuit opens after N consecutive RPC failures
 * - Job processing pauses during cooldown
 * - Exponential backoff for recovery attempts
 */
export function startRetryWorker(
  handler: RetryHandler,
  intervalMs = 60_000,
): () => void {
  const breaker = getCircuitBreaker();

  // Wrap the circuit breaker's state-change callback so we can log transitions
  const originalOnStateChange = breaker['config'].onStateChange;
  breaker['config'].onStateChange = (from: CircuitState, to: CircuitState) => {
    if (from !== to) {
      logger.warn(
        { from, to, ...breaker.getStatus() },
        'circuit_breaker: state changed',
      );
    }
    originalOnStateChange?.(from, to);
  };

  const timer = setInterval(async () => {
    const entries = await listDlqEntries();
    if (entries.length === 0) return;

    // Respect circuit breaker state
    if (!breaker.allowRequest()) {
      const remaining = breaker.getRemainingCooldown();
      logger.warn(
        { remaining, state: breaker.getState(), count: entries.length },
        'circuit_breaker: job processing paused',
      );
      return;
    }

    logger.info(
      { count: entries.length, state: breaker.getState() },
      'oracle_dlq: retry worker running',
    );

    try {
      for (const entry of entries) {
        // Record the attempt before calling the handler
        entry.attempts += 1;
        entry.lastAttemptAt = Date.now();
        await updateDlqEntry(entry.id, {
          attempts: entry.attempts,
          lastAttemptAt: entry.lastAttemptAt,
        });

        try {
          await handler(entry);
          await removeDlqEntry(entry.id);
          breaker.recordSuccess();
          logger.info({ dlqId: entry.id }, 'oracle_dlq: entry resolved');
        } catch (err) {
          const isRpcError =
            String(err).includes('RPC') || String(err).includes('Network');

          if (isRpcError) {
            const circuitOpened = breaker.recordFailure();
            if (circuitOpened) {
              logger.error(
                {
                  dlqId: entry.id,
                  attempt: entry.attempts,
                  failureCount: breaker.getFailureCount(),
                  cooldown: breaker.getRemainingCooldown(),
                },
                'circuit_breaker: RPC circuit opened, pausing job processing',
              );
              // Stop processing remaining entries this cycle
              break;
            }
          }

          logger.warn(
            {
              dlqId: entry.id,
              attempt: entry.attempts,
              isRpcError,
              err: String(err).substring(0, 100),
            },
            'oracle_dlq: retry failed',
          );
        }

        await emitDlqDepth();
      }
    } catch (err) {
      logger.error({ err: String(err) }, 'oracle_dlq: retry worker error');
    }
  }, intervalMs);

  return () => {
    clearInterval(timer);
  };
}

/**
 * Shut down the queue store cleanly on application exit.
 */
export async function closeQueue(): Promise<void> {
  if (queueStore) {
    await queueStore.close();
    queueStore = null;
  }
}
