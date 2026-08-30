# Security Policy

## Responsible Disclosure Contact

**Do not open a public GitHub issue for security vulnerabilities.**

Use one of the following private disclosure channels:

1. **GitHub Private Security Advisory** (preferred): Go to the
   [Security Advisories](../../security/advisories/new) tab of this repository and
   open a draft advisory. This keeps all communication private and lets us
   coordinate a fix before public disclosure.
2. **Email**: Send full details to **security@smile4money.io**. Encrypt the message
   with our PGP key (published in the GitHub organisation profile) if the disclosure
   contains exploit code or a proof-of-concept.

Please include:
- A clear description of the vulnerability and its potential impact.
- Steps to reproduce or a proof-of-concept (PoC).
- The affected component(s) and version/commit hash.
- Your suggested severity (Critical / High / Medium / Low).

We will acknowledge receipt within **48 hours** and provide an initial triage
assessment within **7 days**. We aim to ship a fix within **90 days** of
confirmed triage for High/Critical issues and within **30 days** for
Medium/Low issues, depending on complexity.

We credit researchers who report valid vulnerabilities in the release notes and
CHANGELOG unless they prefer to remain anonymous.

---

## Response SLA

| Stage                  | Target timeline                          |
|------------------------|------------------------------------------|
| Acknowledgement        | Within 48 hours of report receipt        |
| Initial triage         | Within 7 calendar days                   |
| Fix for Critical/High  | Within 90 calendar days of triage        |
| Fix for Medium/Low     | Within 30 calendar days of triage        |
| Public disclosure      | Coordinated with reporter after fix ships |

---

## Bug Bounty

There is **no formal bug bounty program** at this time. We recognise and credit
researchers who report valid vulnerabilities; financial rewards are evaluated
case-by-case for Critical severity findings at the maintainers' discretion.

---

## In-Scope Components

The following components and vulnerability classes are in scope for vulnerability reports:

| Component | Location | Example vulnerability classes |
|-----------|----------|-------------------------------|
| Escrow smart contract | `contracts/escrow/src/` | Fund theft, state machine bypass, integer overflow, reentrancy-like patterns, unauthorised access to admin/oracle functions |
| Oracle smart contract | `contracts/oracle/src/` | Result forgery, replay attacks, unauthorised result submission or overwrite |
| Contract registry | `contracts/contract-registry/src/` | Unauthorised registration/deregistration, max-events bypass |
| Off-chain oracle service | `apps/backend/` | Oracle key compromise path, result manipulation, API injection that alters reported game outcomes |
| Frontend dApp | `apps/frontend/` | Cross-site scripting (XSS), wallet-draining transaction crafting, phishing via UI manipulation |
| Deployment scripts | `scripts/` | Secret leakage, supply-chain tampering with WASM artifacts |

---

## Out-of-Scope Items

The following are **not** in scope:

- Vulnerabilities in the Lichess or Chess.com APIs themselves.
- Vulnerabilities in third-party libraries not introduced by this project.
- Stellar/Soroban protocol-level bugs (report those to the Stellar Development
  Foundation directly).
- Social-engineering attacks against maintainers.
- Denial-of-service attacks that only affect development/testnet deployments.
- Issues already publicly disclosed or present in a dependency's own advisory
  database.

---

## Threat Model

### Trust Assumptions

| Actor | Trusted for | Not trusted for |
|-------|-------------|-----------------|
| Stellar network | Correct Soroban contract execution | — |
| Oracle service | Accurate game result reporting | Custody of player funds |
| Admin key | Pause/unpause, oracle rotation, result override | Accessing escrowed funds unilaterally |
| Players | Their own key management | Each other |

No single party can unilaterally steal funds. All payout rules are enforced on-chain.

### Attack Vectors

#### Re-initialization
**Threat**: Attacker calls `initialize` a second time to overwrite oracle/admin.  
**Mitigation**: Both contracts check storage for an existing key and panic on a second call.

#### Oracle Substitution
**Threat**: Attacker replaces the oracle address to redirect payouts.  
**Mitigation**: Oracle address can only be rotated by the admin via `update_oracle`.

#### Unauthorized Result Submission
**Threat**: Non-oracle address calls `submit_result`.  
**Mitigation**: `submit_result` compares `caller` against the stored oracle address and returns `Error::Unauthorized` before any state change.

#### Double Result Submission
**Threat**: Oracle submits a result twice to change the winner.  
**Mitigation**: Match state is checked for `Active` before processing; once in `PendingResult`, `submit_result` is rejected with `InvalidState`. Oracle contract additionally rejects duplicates with `Error::AlreadySubmitted`.

#### Cross-Match Result Injection
**Threat**: Compromised oracle submits a result for the correct `match_id` but a different `game_id`.  
**Mitigation**: `submit_result` validates `game_id` against the value stored at match creation. Mismatch returns `Error::GameIdMismatch`.

#### Duplicate Game ID
**Threat**: Multiple matches reference the same chess `game_id`; one oracle result pays out all of them.  
**Mitigation**: `create_match` stores each `game_id` in persistent storage and returns `Error::DuplicateGameId` on collision.

#### Incorrect Oracle Result
**Threat**: Oracle submits an incorrect result (due to API error or key compromise), causing irreversible fund loss.  
**Mitigation**: Results enter a `PendingResult` dispute window for `DISPUTE_WINDOW_LEDGERS` (~24 hours). During this window the admin can call `override_result` to correct the outcome. After the window expires, `finalize_result` executes the payout.

#### Fund Lock on Oracle Failure
**Threat**: Oracle service crashes permanently; player funds are locked in `Active` state forever.  
**Mitigation**: Either player may call `claim_timeout` after `TIMEOUT_LEDGERS` (~7 days) without a result. Both players receive their `stake_amount` back and the match is `Cancelled`.

#### Deposit into Inactive Match
**Threat**: Player deposits into a cancelled or completed match, locking funds.  
**Mitigation**: `deposit` requires `state == Pending`; any other state returns `Error::InvalidState`.

#### Zero-Stake Match
**Threat**: Match created with `stake_amount = 0` wastes ledger storage.  
**Mitigation**: `create_match` returns `Error::InvalidAmount` if `stake_amount <= 0`.

#### Self-Match
**Threat**: Single address creates a match against itself.  
**Mitigation**: `create_match` checks `player1 != player2` and returns `Error::InvalidPlayers`.

#### Integer Overflow in Match Counter
**Threat**: `MatchCount` wraps silently, reusing match IDs.  
**Mitigation**: `create_match` uses `checked_add(1).ok_or(Error::Overflow)?`.

#### Storage Expiry
**Threat**: A persistent `Match` entry expires mid-game.  
**Mitigation**: Every persistent write calls `extend_ttl` with `MATCH_TTL_LEDGERS` (~30 days).

#### No Emergency Stop
**Threat**: Critical bug discovered post-deployment with no way to halt damage.  
**Mitigation**: Admin can call `pause()` to block `create_match`, `deposit`, and `submit_result`. `cancel_match` and `claim_timeout` remain available so players can recover funds.

---

## Access Control Summary

| Function | Caller |
|----------|--------|
| `initialize` | Anyone (once only) |
| `create_match` | `player1` (requires auth) |
| `deposit` | `player1` or `player2` (requires auth) |
| `cancel_match` | `player1` or `player2` (requires auth) |
| `submit_result` | Registered oracle only |
| `override_result` | Admin only |
| `finalize_result` | Anyone (callable after dispute window) |
| `claim_timeout` | `player1` or `player2` (requires auth, after timeout) |
| `pause` / `unpause` | Admin only |
| `update_oracle` | Admin only |
| `get_match` / `is_funded` / `get_escrow_balance` | Anyone (read-only) |

---

## Audit Checklist

### Authentication & Authorization
- [ ] All state-mutating functions require `require_auth()` from the appropriate caller
- [ ] Oracle address is validated before any payout is executed
- [ ] Admin-only functions reject non-admin callers before any storage write
- [ ] `override_result` is restricted to admin and enforces the dispute window boundary

### State Machine Integrity
- [ ] All state transitions are guarded; invalid transitions return `Error::InvalidState`
- [ ] `Completed` and `Cancelled` are terminal — no further transitions possible
- [ ] `deposit` is rejected on non-`Pending` matches
- [ ] `submit_result` transitions to `PendingResult`, not directly to `Completed`
- [ ] `finalize_result` can only execute after `DISPUTE_WINDOW_LEDGERS` have elapsed

### Fund Safety
- [ ] Payout amounts are exactly `stake_amount * 2` (winner) or `stake_amount` each (draw)
- [ ] `cancel_match` refunds only deposited players; non-depositors receive nothing
- [ ] `claim_timeout` refunds both players their original `stake_amount`
- [ ] No code path allows funds to be sent to an address other than `player1`, `player2`, or back to depositor
- [ ] `get_escrow_balance` returns 0 for `Completed` and `Cancelled` matches

### Input Validation
- [ ] `stake_amount <= 0` is rejected
- [ ] `player1 == player2` is rejected
- [ ] `game_id` length is bounded by `MAX_GAME_ID_LEN`
- [ ] Duplicate `game_id` across matches is rejected

### Oracle Security
- [ ] `game_id` is verified against the stored value on every `submit_result` call
- [ ] Oracle address can only be changed by the admin
- [ ] Incorrect results can be corrected within `DISPUTE_WINDOW_LEDGERS` via `override_result`
- [ ] `override_result` is blocked after the dispute window expires

### Timeout Mechanism
- [ ] `activated_ledger` is recorded when match transitions to `Active`
- [ ] `claim_timeout` checks `current_ledger - activated_ledger > TIMEOUT_LEDGERS`
- [ ] `claim_timeout` is rejected before the timeout period elapses
- [ ] Only `player1` or `player2` can call `claim_timeout`

### Storage & TTL
- [ ] All persistent entries call `extend_ttl` on every write
- [ ] `MatchCount` increment uses `checked_add` to prevent overflow

### Pause Mechanism
- [ ] `pause()` blocks `create_match`, `deposit`, and `submit_result`
- [ ] `cancel_match` and `claim_timeout` remain callable while paused
- [ ] Only admin can pause/unpause


## Hall of Fame

We appreciate the security researchers who help make this project safer. If you report a valid vulnerability and agree to coordinated disclosure, we will add your name (or handle) here.

*No entries yet – be the first!*

### Known Limitations
- The oracle is a centralised component; a compromised oracle key can submit incorrect results within the dispute window. Mitigated by the `override_result` admin function and `update_oracle` key rotation.
- The dispute window admin override is itself a centralised control. A compromised admin key could manipulate results during the window. Mitigated by making `override_result` only callable during the window and emitting an `oracle:result_overridden` event for transparency.
