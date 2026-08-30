import dotenv from 'dotenv';
dotenv.config();

import { app } from './app.js';
import { initializeQueue, closeQueue, startRetryWorker, listDlqEntries, writeToDlq } from './queue.js';
import { initializeMatchStore } from './store/index.js';
import { PollingJobStore, PollingWorker } from './services/polling.js';
import ChessPlatformPoller from './services/game-poller.js';
import logger from './logger.js';

const port = Number(process.env.PORT || 4000);

/**
 * Oracle retry handler for reprocessing DLQ entries.
 * This is a placeholder that can be replaced with actual oracle submission logic.
 */
async function retryOracleSubmission(entry: any): Promise<void> {
  // Implementation depends on how the oracle submits results to the contract.
  // For now, this is a placeholder. In production, this would:
  // 1. Reconstruct the original submission request from entry.payload
  // 2. Call the Stellar RPC to submit the result
  // 3. Throw if submission fails
  
  logger.debug({ dlqId: entry.id }, 'Retrying oracle submission');
  // Placeholder: successful retry (would be replaced with actual logic)
}

async function main() {
  try {
    // Initialize the persistent queue store
    await initializeQueue();
    logger.info('Queue store initialized');

    // Initialize the persistent match store (SQLite-backed)
    await initializeMatchStore();
    logger.info('Match store initialized');

    // Load any pending jobs from the queue on startup
    const pendingEntries = await listDlqEntries();
    logger.info(
      { count: pendingEntries.length },
      `Loaded ${pendingEntries.length} pending oracle submissions from queue`
    );

    // Start the retry worker
    const stopRetryWorker = startRetryWorker(retryOracleSubmission, 60_000);

    // Set up the polling worker with DLQ wiring for max-attempts exceeded
    const pollingStore = new PollingJobStore();
    const gamePoller = new ChessPlatformPoller();
    const pollingWorker = new PollingWorker(pollingStore, gamePoller, {
      pollingIntervalMs: Number(process.env.POLLING_INTERVAL_MS ?? 30_000),
      maxPollingAttempts: Number(process.env.MAX_POLLING_ATTEMPTS ?? 1440),
      backoffMultiplier: Number(process.env.POLLING_BACKOFF_MULTIPLIER ?? 1.0),
      onGameCompleted: async (job, result) => {
        logger.info(
          {
            match_id: job.matchId,
            game_id: job.gameId,
            platform: job.platform,
            result,
            attempts: job.pollingAttempt,
          },
          'polling_job_game_completed_submitting_to_oracle',
        );
        // TODO: invoke the oracle submission pipeline here
        // e.g. await submitToOracle({ matchId: job.matchId, gameId: job.gameId, result })
      },
      onMaxAttemptsExceeded: async (job, reason) => {
        logger.error(
          {
            match_id: job.matchId,
            game_id: job.gameId,
            platform: job.platform,
            attempts: job.pollingAttempt,
            reason,
          },
          'polling_job_max_attempts_exceeded_writing_to_dlq',
        );
        await writeToDlq(
          { job },
          reason ?? 'max polling attempts exceeded',
        );
      },
    });
    const stopPollingWorker = pollingWorker.start();

    // Start the Express server
    const server = app.listen(port, () => {
      logger.info(
        { port },
        `smile4money-backend listening on http://localhost:${port}`
      );
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      stopPollingWorker();
      stopRetryWorker();
      await closeQueue();
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main();
