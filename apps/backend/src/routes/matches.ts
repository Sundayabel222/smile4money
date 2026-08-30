import { Router } from 'express';
import { matchStore } from '../store/index.js';
import { authenticate } from '../middleware/auth.js';
import { fetchLichessResult, GameNotFoundError } from '../fetchers/lichess.js';
import { fetchChessDotComResult } from '../fetchers/chessdotcom.js';

const router = Router();
const store = matchStore;

router.use(authenticate);

async function validateGameExists(
  platform: string,
  gameId: string,
  username?: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    if (platform === 'lichess') {
      await fetchLichessResult(gameId);
      return { valid: true };
    } else if (platform === 'chessdotcom') {
      if (!username || username.length === 0) {
        return {
          valid: false,
          error: 'username is required for chessdotcom game validation',
        };
      }
      await fetchChessDotComResult(username, gameId);
      return { valid: true };
    }
    return { valid: false, error: 'invalid platform' };
  } catch (error) {
    if (error instanceof GameNotFoundError) {
      return { valid: false, error: error.message };
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { valid: false, error: `Game validation failed: ${message}` };
  }
}

/**
 * Fetch the game result and extract player identities (usernames) from the
 * chess platform API response. These are stored in the match record for later
 * verification when the oracle submits the result.
 */
async function getGameResultWithPlayerIdentities(
  platform: string,
  gameId: string,
  username?: string,
): Promise<{ whitePlayer?: string; blackPlayer?: string; error?: string }> {
  try {
    if (platform === 'lichess') {
      const result = await fetchLichessResult(gameId);
      return { whitePlayer: result.whitePlayer, blackPlayer: result.blackPlayer };
    } else if (platform === 'chessdotcom') {
      if (!username || username.length === 0) {
        return { error: 'username is required for chessdotcom' };
      }
      const result = await fetchChessDotComResult(username, gameId);
      return { whitePlayer: result.whitePlayer, blackPlayer: result.blackPlayer };
    }
    return { error: 'invalid platform' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { error: message };
  }
}

router.post('/', async (req, res) => {
  const payload = req.body;

  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Request body must be JSON' });
  }

  const { player2, stakeAmount, token, gameId, platform, username } = payload;

  if (!player2 || typeof player2 !== 'string') {
    return res.status(400).json({ error: 'player2 is required' });
  }
  if (typeof stakeAmount !== 'number' || !Number.isFinite(stakeAmount)) {
    return res.status(400).json({ error: 'stakeAmount must be a number' });
  }
  if (stakeAmount <= 0 || stakeAmount > Number.MAX_SAFE_INTEGER) {
    return res.status(400).json({ error: 'stakeAmount must be a valid, positive amount' });
  }
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'token is required' });
  }
  if (!gameId || typeof gameId !== 'string' || gameId.length === 0) {
    return res.status(400).json({ error: 'gameId is required' });
  }
  if (gameId.length >= 512) {
    return res.status(400).json({ error: 'gameId is too long' });
  }
  if (!platform || (platform !== 'lichess' && platform !== 'chessdotcom')) {
    return res.status(400).json({ error: 'platform must be lichess or chessdotcom' });
  }

  if (req.address?.toUpperCase() === player2.toUpperCase()) {
    return res.status(400).json({ error: 'player1 and player2 must be different addresses' });
  }

  // First, verify the game exists and get player identities from the API
  const gameResult = await getGameResultWithPlayerIdentities(
    platform,
    gameId,
    typeof username === 'string' ? username : undefined,
  );
  if (gameResult.error) {
    return res.status(400).json({
      error: 'Invalid game',
      details: gameResult.error,
    });
  }

  try {
    const match = await store.createMatch({
      player1: req.address,
      player2,
      player1Username: gameResult.whitePlayer,
      player2Username: gameResult.blackPlayer,
      stakeAmount,
      token,
      gameId,
      platform,
    });
    return res.status(201).json(match);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('duplicate')) {
      return res.status(409).json({ error: 'duplicate gameId' });
    }
    return res.status(500).json({ error: message });
  }
});

export default router;
