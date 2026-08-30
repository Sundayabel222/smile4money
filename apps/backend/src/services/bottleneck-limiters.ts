/**
 * Bottleneck Rate Limiter Configuration
 *
 * Manages rate limiters for external APIs using Bottleneck.
 * Each API service (Lichess, Chess.com) has its own rate limiter instance.
 */

import Bottleneck from 'bottleneck';
import logger from '../logger.js';

interface LimiterConfig {
  minTime: number; // Minimum time between requests (ms)
  maxConcurrent: number; // Maximum concurrent requests
  reservoir?: number; // Number of requests allowed per period
  reservoirRefreshAmount?: number; // Requests to add per refresh
  reservoirRefreshInterval?: number; // Refresh interval (ms)
}

interface RateLimiterOptions {
  name: string;
  maxRequests: number; // Requests allowed per period
  periodMs: number; // Period duration (ms)
  maxConcurrent?: number; // Concurrent requests allowed (default: 1)
}

/**
 * Create a Bottleneck limiter instance with the specified configuration.
 * Uses a reservoir-based approach: maxRequests per periodMs.
 */
function createLimiter(options: RateLimiterOptions): Bottleneck {
  const config: LimiterConfig = {
    minTime: 0,
    maxConcurrent: options.maxConcurrent || 1,
    reservoir: options.maxRequests,
    reservoirRefreshAmount: options.maxRequests,
    reservoirRefreshInterval: options.periodMs,
  };

  const limiter = new Bottleneck(config);

  // Log rate limit events
  limiter.on('debug', (eventInfo: any) => {
    if (eventInfo?.message === 'Dropping due to time limit') {
      const counts = limiter.counts();
      logger.debug(
        { service: options.name, queued: counts.QUEUED },
        `${options.name}: request queued (${counts.QUEUED} waiting)`
      );
    }
  });

  // Track errors
  limiter.on('error', (error) => {
    logger.error(
      { service: options.name, error },
      `${options.name}: limiter error`
    );
  });

  logger.info(
    {
      service: options.name,
      maxRequests: options.maxRequests,
      periodSeconds: options.periodMs / 1000,
      maxConcurrent: config.maxConcurrent,
    },
    `${options.name} rate limiter configured`
  );

  return limiter;
}

/**
 * DEPRECATED: Do not use. Creates independent limiter instances per call.
 *
 * This function is deprecated and should not be used. It creates a new
 * limiter instance on each invocation, meaning each caller gets an independent
 * token reservoir. Multiple callers using this function can exceed API rate
 * limits by a factor of N (number of callers).
 *
 * Use getLichessLimiterSingleton() instead, which shares a single rate limit
 * bucket across all callers.
 *
 * @deprecated Use getLichessLimiterSingleton() instead.
 */
export function getLichessLimiter(): Bottleneck {
  const maxRequests = parseInt(process.env.LICHESS_RATE_LIMIT || '30', 10);
  const periodMs = parseInt(process.env.LICHESS_RATE_PERIOD_MS || String(60_000), 10);

  return createLimiter({
    name: 'Lichess',
    maxRequests,
    periodMs,
    maxConcurrent: 1,
  });
}

/**
 * DEPRECATED: Do not use. Creates independent limiter instances per call.
 *
 * This function is deprecated and should not be used. It creates a new
 * limiter instance on each invocation, meaning each caller gets an independent
 * token reservoir. Multiple callers using this function can exceed API rate
 * limits by a factor of N (number of callers).
 *
 * Use getChessDotComLimiterSingleton() instead, which shares a single rate limit
 * bucket across all callers.
 *
 * @deprecated Use getChessDotComLimiterSingleton() instead.
 */
export function getChessDotComLimiter(): Bottleneck {
  const maxRequests = parseInt(process.env.CHESSDOTCOM_RATE_LIMIT || '20', 10);
  const periodMs = parseInt(process.env.CHESSDOTCOM_RATE_PERIOD_MS || String(60_000), 10);

  return createLimiter({
    name: 'Chess.com',
    maxRequests,
    periodMs,
    maxConcurrent: 1,
  });
}

/**
 * Singleton instances (created on first access).
 */
let lichessLimiter: Bottleneck | null = null;
let chessDotComLimiter: Bottleneck | null = null;

/**
 * Get or create the Lichess limiter singleton.
 */
export function getLichessLimiterSingleton(): Bottleneck {
  if (!lichessLimiter) {
    lichessLimiter = createLimiter({
      name: 'Lichess',
      maxRequests: parseInt(process.env.LICHESS_RATE_LIMIT || '30', 10),
      periodMs: parseInt(process.env.LICHESS_RATE_PERIOD_MS || String(60_000), 10),
      maxConcurrent: 1,
    });
  }
  return lichessLimiter;
}

/**
 * Get or create the Chess.com limiter singleton.
 */
export function getChessDotComLimiterSingleton(): Bottleneck {
  if (!chessDotComLimiter) {
    chessDotComLimiter = createLimiter({
      name: 'Chess.com',
      maxRequests: parseInt(process.env.CHESSDOTCOM_RATE_LIMIT || '20', 10),
      periodMs: parseInt(process.env.CHESSDOTCOM_RATE_PERIOD_MS || String(60_000), 10),
      maxConcurrent: 1,
    });
  }
  return chessDotComLimiter;
}

/**
 * Get current stats for all limiters.
 */
export function getAllLimiterStats() {
  const stats: Record<string, any> = {};

  if (lichessLimiter) {
    const counts = lichessLimiter.counts();
    stats.lichess = {
      queued: counts.QUEUED,
      executing: counts.EXECUTING,
    };
  }

  if (chessDotComLimiter) {
    const counts = chessDotComLimiter.counts();
    stats.chessdotcom = {
      queued: counts.QUEUED,
      executing: counts.EXECUTING,
    };
  }

  return stats;
}
