import { describe, it, expect } from 'vitest';
import { verifyPlayerIdentities } from '../src/services/player-identity.js';
import type { MatchRecord } from '../src/store/match-store.js';
import type { GameResult } from '../src/fetchers/lichess.js';

describe('Player Identity Verification', () => {
  const mockMatch: MatchRecord = {
    matchId: 1,
    player1: 'GPLAYER1AAAA',
    player2: 'GPLAYER2BBBB',
    player1Username: 'alice',
    player2Username: 'bob',
    stakeAmount: 100,
    token: 'XLM',
    gameId: 'abc123',
    platform: 'lichess',
    state: 'Pending',
  };

  describe('verifyPlayerIdentities', () => {
    it('returns valid when players match exactly', () => {
      const gameResult: GameResult = {
        gameId: 'abc123',
        status: 'mate',
        whitePlayer: 'alice',
        blackPlayer: 'bob',
        result: 'Player1Wins',
      };

      const identityMap = {
        player1Address: 'GPLAYER1AAAA',
        player1Username: 'alice',
        player2Address: 'GPLAYER2BBBB',
        player2Username: 'bob',
        platform: 'lichess',
      };

      const result = verifyPlayerIdentities(mockMatch, gameResult, identityMap);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('returns valid when players are swapped', () => {
      const gameResult: GameResult = {
        gameId: 'abc123',
        status: 'mate',
        whitePlayer: 'bob',
        blackPlayer: 'alice',
        result: 'Player2Wins',
      };

      const identityMap = {
        player1Address: 'GPLAYER1AAAA',
        player1Username: 'alice',
        player2Address: 'GPLAYER2BBBB',
        player2Username: 'bob',
        platform: 'lichess',
      };

      const result = verifyPlayerIdentities(mockMatch, gameResult, identityMap);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('returns invalid when white player does not match', () => {
      const gameResult: GameResult = {
        gameId: 'abc123',
        status: 'mate',
        whitePlayer: 'charlie',
        blackPlayer: 'bob',
        result: 'Player1Wins',
      };

      const identityMap = {
        player1Address: 'GPLAYER1AAAA',
        player1Username: 'alice',
        player2Address: 'GPLAYER2BBBB',
        player2Username: 'bob',
        platform: 'lichess',
      };

      const result = verifyPlayerIdentities(mockMatch, gameResult, identityMap);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Player identity mismatch');
    });

    it('returns invalid when black player does not match', () => {
      const gameResult: GameResult = {
        gameId: 'abc123',
        status: 'mate',
        whitePlayer: 'alice',
        blackPlayer: 'charlie',
        result: 'Player1Wins',
      };

      const identityMap = {
        player1Address: 'GPLAYER1AAAA',
        player1Username: 'alice',
        player2Address: 'GPLAYER2BBBB',
        player2Username: 'bob',
        platform: 'lichess',
      };

      const result = verifyPlayerIdentities(mockMatch, gameResult, identityMap);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Player identity mismatch');
    });

    it('returns invalid when both players do not match', () => {
      const gameResult: GameResult = {
        gameId: 'abc123',
        status: 'mate',
        whitePlayer: 'charlie',
        blackPlayer: 'david',
        result: 'Player1Wins',
      };

      const identityMap = {
        player1Address: 'GPLAYER1AAAA',
        player1Username: 'alice',
        player2Address: 'GPLAYER2BBBB',
        player2Username: 'bob',
        platform: 'lichess',
      };

      const result = verifyPlayerIdentities(mockMatch, gameResult, identityMap);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Player identity mismatch');
    });

    it('handles case-insensitive comparison', () => {
      const gameResult: GameResult = {
        gameId: 'abc123',
        status: 'mate',
        whitePlayer: 'ALICE',
        blackPlayer: 'BOB',
        result: 'Player1Wins',
      };

      const identityMap = {
        player1Address: 'GPLAYER1AAAA',
        player1Username: 'alice',
        player2Address: 'GPLAYER2BBBB',
        player2Username: 'bob',
        platform: 'lichess',
      };

      const result = verifyPlayerIdentities(mockMatch, gameResult, identityMap);
      expect(result.valid).toBe(true);
    });

    it('handles usernames with whitespace', () => {
      const gameResult: GameResult = {
        gameId: 'abc123',
        status: 'mate',
        whitePlayer: '  alice  ',
        blackPlayer: '  bob  ',
        result: 'Player1Wins',
      };

      const identityMap = {
        player1Address: 'GPLAYER1AAAA',
        player1Username: 'alice',
        player2Address: 'GPLAYER2BBBB',
        player2Username: 'bob',
        platform: 'lichess',
      };

      const result = verifyPlayerIdentities(mockMatch, gameResult, identityMap);
      expect(result.valid).toBe(true);
    });

    it('handles empty player names', () => {
      const gameResult: GameResult = {
        gameId: 'abc123',
        status: 'mate',
        whitePlayer: '',
        blackPlayer: '',
        result: null,
      };

      const identityMap = {
        player1Address: 'GPLAYER1AAAA',
        player1Username: 'alice',
        player2Address: 'GPLAYER2BBBB',
        player2Username: 'bob',
        platform: 'lichess',
      };

      const result = verifyPlayerIdentities(mockMatch, gameResult, identityMap);
      expect(result.valid).toBe(false);
    });

    it('returns invalid when the registered player1 username is empty', () => {
      // The API reports a real player, but the on-chain record registered an
      // empty username for player1. An empty registered name must not match.
      const gameResult: GameResult = {
        gameId: 'abc123',
        status: 'mate',
        whitePlayer: 'alice',
        blackPlayer: 'bob',
        result: 'Player1Wins',
      };

      const identityMap = {
        player1Address: 'GPLAYER1AAAA',
        player1Username: '',
        player2Address: 'GPLAYER2BBBB',
        player2Username: 'bob',
        platform: 'lichess',
      };

      const result = verifyPlayerIdentities(mockMatch, gameResult, identityMap);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty username');
    });

    it('returns invalid when the registered player2 username is empty', () => {
      const gameResult: GameResult = {
        gameId: 'abc123',
        status: 'mate',
        whitePlayer: 'alice',
        blackPlayer: 'bob',
        result: 'Player1Wins',
      };

      const identityMap = {
        player1Address: 'GPLAYER1AAAA',
        player1Username: 'alice',
        player2Address: 'GPLAYER2BBBB',
        player2Username: '',
        platform: 'lichess',
      };

      const result = verifyPlayerIdentities(mockMatch, gameResult, identityMap);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty username');
    });

    it('returns invalid when both API and registered usernames are empty (no false positive)', () => {
      // Edge case from the issue: empty API names matching empty registered
      // names must NOT be treated as a valid identity match.
      const gameResult: GameResult = {
        gameId: 'abc123',
        status: 'mate',
        whitePlayer: '',
        blackPlayer: '',
        result: null,
      };

      const identityMap = {
        player1Address: 'GPLAYER1AAAA',
        player1Username: '',
        player2Address: 'GPLAYER2BBBB',
        player2Username: '',
        platform: 'lichess',
      };

      const result = verifyPlayerIdentities(mockMatch, gameResult, identityMap);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty username');
    });

    it('returns invalid when only one of the API usernames is empty', () => {
      const gameResult: GameResult = {
        gameId: 'abc123',
        status: 'mate',
        whitePlayer: 'alice',
        blackPlayer: '',
        result: 'Player1Wins',
      };

      const identityMap = {
        player1Address: 'GPLAYER1AAAA',
        player1Username: 'alice',
        player2Address: 'GPLAYER2BBBB',
        player2Username: 'bob',
        platform: 'lichess',
      };

      const result = verifyPlayerIdentities(mockMatch, gameResult, identityMap);
      expect(result.valid).toBe(false);
    });
  });
});
