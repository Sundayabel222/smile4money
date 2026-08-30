/**
 * Player Identity Verification Service
 *
 * This service verifies that the players reported by the chess platform APIs
 * (Lichess or Chess.com) correspond to the Stellar addresses registered in
 * the on-chain match record.
 *
 * Security Model:
 * ───────────────
 * When a match is created, the off-chain oracle records the mapping between:
 *   - Stellar addresses (player1, player2)
 *   - Chess platform usernames (e.g., alice, bob on Lichess)
 *
 * When the oracle later fetches and submits a game result, it verifies:
 *   1. The game exists on the platform
 *   2. The two players in the game match the registered mapping
 *   3. The result is submitted to the correct match_id
 *
 * This prevents a malicious actor from "swapping" results between matches or
 * injecting game results where the oracle never verified player identities.
 *
 * Example Attack Scenario (Without Verification):
 * ───────────────────────────────────────────────
 * 1. Admin creates match: (player1=Alice, player2=Bob) for game ABC123
 * 2. Malicious oracle submits result of DIFFERENT game XYZ789 where:
 *    - White: Charlie, Black: David
 *    - Result: Charlie wins
 * 3. Escrow contract pays Alice (player1) because the result says "Player1Wins"
 * 4. But Charlie and David played game XYZ789, not Alice and Bob!
 *
 * Defense:
 * ─────────
 * Before accepting the result, the oracle verifies:
 *   - Game ABC123 players: white=alice, black=bob ✓ matches player1/player2
 *   - Result: alice wins → payout to Alice (player1) ✓ correct
 *
 * Injected game XYZ789 would be rejected because charlie/david don't match
 * the registered players.
 */

import type { GameResult } from '../fetchers/lichess.js';
import type { MatchRecord } from '../store/match-store.js';

/**
 * Represents the mapping of Stellar addresses to chess platform usernames.
 */
export interface PlayerIdentityMap {
  /** Player 1's Stellar address */
  player1Address: string;
  /** Player 1's username on the chess platform */
  player1Username: string;
  /** Player 2's Stellar address */
  player2Address: string;
  /** Player 2's username on the chess platform */
  player2Username: string;
  /** Chess platform ('lichess' or 'chessdotcom') */
  platform: string;
}

/**
 * Result of player identity verification.
 */
export interface VerificationResult {
  valid: boolean;
  error?: string;
}

/**
 * Verify that the players in an API game result match the on-chain match record.
 *
 * # Arguments
 *
 * - `match` - The on-chain match record with registered player addresses
 * - `result` - The game result from the chess platform API
 *
 * # Returns
 *
 * - `{ valid: true }` if players match
 * - `{ valid: false, error: "..." }` if verification fails
 *
 * # Verification Logic
 *
 * The function checks if the reported players (by username) correspond to the
 * registered Stellar addresses:
 *
 * 1. **Exact Match**: Both usernames match in order
 *    - API: white=alice, black=bob
 *    - Registered: player1=alice, player2=bob
 *    - Result: ✓ Valid
 *
 * 2. **Swapped Players**: Usernames match but in reverse order
 *    - API: white=bob, black=alice
 *    - Registered: player1=alice, player2=bob
 *    - Result: ✓ Valid (but result will be flipped: player2 wins instead of player1)
 *
 * 3. **Missing Player**: Username not found or doesn't match
 *    - API: white=alice, black=charlie
 *    - Registered: player1=alice, player2=bob
 *    - Result: ✗ Invalid (charlie ≠ bob)
 *
 * 4. **Injected Game**: Completely different players
 *    - API: white=charlie, black=david
 *    - Registered: player1=alice, player2=bob
 *    - Result: ✗ Invalid (charlie ≠ alice, david ≠ bob)
 *
 * # Case Sensitivity
 *
 * Usernames are compared case-insensitively after trimming whitespace,
 * as chess platform usernames are typically case-insensitive.
 */
export function verifyPlayerIdentities(
  match: MatchRecord,
  result: GameResult,
  identityMap: PlayerIdentityMap,
): VerificationResult {
  // Normalize usernames for comparison (case-insensitive, trim whitespace)
  const normalize = (name: string) => (name || '').trim().toLowerCase();

  const whiteNorm = normalize(result.whitePlayer);
  const blackNorm = normalize(result.blackPlayer);
  const player1Norm = normalize(identityMap.player1Username);
  const player2Norm = normalize(identityMap.player2Username);

  // An empty username must never be considered a valid player identity.
  // If either the API-reported name or the registered name is empty, the
  // normalization above would collapse it to "" and could otherwise produce a
  // false-positive match (e.g. an empty registered name matching an empty API
  // name). Reject any pairing that contains an empty username.
  if (!whiteNorm || !blackNorm || !player1Norm || !player2Norm) {
    return {
      valid: false,
      error: `Player identity contains an empty username. Expected (${player1Norm || '<empty>'}, ${player2Norm || '<empty>'}) but got (${whiteNorm || '<empty>'}, ${blackNorm || '<empty>'})`,
    };
  }

  // Check for exact match: white=player1, black=player2
  if (whiteNorm === player1Norm && blackNorm === player2Norm) {
    return { valid: true };
  }

  // Check for swapped match: white=player2, black=player1
  // This is valid because the players can play on either color.
  // The result will be interpreted differently (player2 wins → player1 wins),
  // but the game involves the correct players.
  if (whiteNorm === player2Norm && blackNorm === player1Norm) {
    return { valid: true };
  }

  // If neither exact nor swapped matches, the players don't correspond
  return {
    valid: false,
    error: `Player identity mismatch. Expected (${player1Norm}, ${player2Norm}) or (${player2Norm}, ${player1Norm}), but got (${whiteNorm}, ${blackNorm})`,
  };
}

/**
 * DEPRECATED: This function is no longer used and has been removed.
 *
 * createIdentityMap assumed player1 was always white, which is incorrect.
 * Color assignment is platform-determined, and assuming a color causes
 * the identity map to be inverted when player1 is black, causing all
 * subsequent verification calls to fail.
 *
 * Instead, usernames are stored directly from the API at match creation
 * time without color assumptions. During verification, usernames are
 * compared against both registered players regardless of color assignment.
 *
 * See verifyPlayerIdentities() for the color-agnostic verification logic.
 */

/**
 * DEPRECATED: This function is no longer used and has been removed.
 *
 * normalizePlayerOrder previously attempted to detect swapped player colors
 * and "correct" the identity map. However, this approach was fundamentally
 * flawed because:
 *
 * 1. Color assignment is platform-determined and cannot be assumed
 * 2. Attempting to swap addresses based on color leads to identity confusion
 * 3. verifyPlayerIdentities() already handles color-agnostic verification
 *    by checking both (white=player1, black=player2) and (white=player2, black=player1)
 *
 * The verification logic now matches usernames to colors without modifying
 * the identity map. See verifyPlayerIdentities() for details.
 */
