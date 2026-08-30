import axios from 'axios';
import { getChessDotComLimiterSingleton } from '../services/bottleneck-limiters.js';
import logger from '../logger.js';
import { RateLimitError } from '../errors/RateLimitError.js';
import type { MatchResult, GameResult } from './lichess.js';

export { GameNotFoundError } from './lichess.js';
export { RateLimitError } from '../errors/RateLimitError.js';
export type { MatchResult, GameResult };

interface ChessDotComGame {
  url: string;
  pgn: string;
  time_control: string;
  end_time: number;
  white: { username: string; result: string };
  black: { username: string; result: string };
}

const WIN_RESULTS = new Set(['win']);
const DRAW_RESULTS = new Set(['agreed', 'stalemate', 'repetition', 'insufficient', 'timevsinsufficient', '50move']);
const IN_PROGRESS = new Set(['in_progress', 'timeout_started']);

/** Extracts the game ID from a Chess.com game URL. */
function extractGameId(url: string): string {
  return url.split('/').pop() ?? url;
}

function mapResult(white: string, black: string): MatchResult | null {
  if (IN_PROGRESS.has(white) || IN_PROGRESS.has(black)) return null;
  if (WIN_RESULTS.has(white)) return 'Player1Wins';
  if (WIN_RESULTS.has(black)) return 'Player2Wins';
  if (DRAW_RESULTS.has(white) || DRAW_RESULTS.has(black)) return 'Draw';
  return 'Draw'; // resigned, timeout, abandoned → treat remaining as draw
}

async function fetchArchive(username: string, year: number, month: number): Promise<ChessDotComGame[]> {
  const mm = String(month).padStart(2, '0');
  const url = `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/${year}/${mm}`;
  const limiter = getChessDotComLimiterSingleton();

  return limiter.schedule(async () => {
    try {
      const response = await axios.get(url, {
        timeout: 10_000,
        validateStatus: (s) => s < 500,
      });

      if (response.status === 404) {
        return [];
      }

      if (response.status === 429) {
        throw new RateLimitError('Chess.com API rate limit exceeded (429)');
      }

      if (response.status !== 200) {
        throw new Error(`Chess.com API error: ${response.status}`);
      }

      return (response.data as { games: ChessDotComGame[] }).games ?? [];
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        { username, year, month, url, error: message },
        'Chess.com API archive fetch failed'
      );
      throw error;
    }
  });
}

/**
 * Fetches a Chess.com game result by username + gameId.
 *
 * Searches the current month's archive first, then walks backwards up to 12 months.
 * Throws GameNotFoundError if the game is not found in any checked archive.
 * Returns result: null when the game is still in progress.
 * Player1 = white, Player2 = black.
 */
export async function fetchChessDotComResult(username: string, gameId: string): Promise<GameResult> {
  const { GameNotFoundError } = await import('./lichess.js');

  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;

    const games = await fetchArchive(username, year, month);
    const game = games.find((g) => extractGameId(g.url) === gameId);

    if (game) {
      const result = mapResult(game.white.result, game.black.result);
      return {
        gameId,
        status: result === null ? 'in_progress' : 'finished',
        whitePlayer: game.white.username,
        blackPlayer: game.black.username,
        result,
      };
    }
  }

  throw new GameNotFoundError(gameId);
}
