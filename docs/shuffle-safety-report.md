# Certified shuffle validation (Issue #37)

## Contract and implementation

Shuffle candidates are cloned from the live snapshot, generated in a worker,
and checked by the same complete `analyzeBoard` search used by progress/deadlock
detection. Only `SOLVABLE` is a commit result. `UNSOLVABLE`, `UNKNOWN`, worker
errors, the five-second deadline, and stale revisions leave the board, moves,
history, STUCK state, and shuffle allowance unchanged.

The commit updates the logical/3D board, one history entry, and one shuffle
allowance together. Restart, difficulty changes, and a newer search terminate
the worker and invalidate its revision. The button is disabled while work is in
flight.

## Reproducible 100,000-request validation

Command: `npm run validate:shuffles` (2026-08-13). Seeds derive from the request
index. The sample contains 33,334 EASY, 33,333 NORMAL, and 33,333 HARD requests,
covering initial, mid-game, and six-tile end-game states. The previous unsafe
baseline was 15.30% unsolvable overall and 27.46% at 44 remaining tiles; the new
committed result is zero in both categories.

| Metric | Result |
| --- | ---: |
| Requests / safe candidates / failures | 100,000 / 99,999 / 1 |
| Committed SOLVABLE / UNSOLVABLE / UNKNOWN | 99,999 / 0 / 0 |
| Immediate complete dead ends | 0 |
| Source-state changes / multiset mismatches | 0 / 0 |
| Double consumption / stale commits | 0 / 0 |
| Candidate attempts average / p95 / p99 / max | 1.08105 / 1 / 3 / 24 |
| Time p50 / p95 / p99 / max | 0.0464 / 0.1653 / 0.7097 / 7,282.44 ms |

| Difficulty | Requests | Success | Safe failure |
| --- | ---: | ---: | ---: |
| EASY | 33,334 | 33,334 | 0 |
| NORMAL | 33,333 | 33,333 | 0 |
| HARD | 33,333 | 33,332 | 1 |

| Remaining tiles | Requests | Success | Safe failure |
| ---: | ---: | ---: | ---: |
| 6 | 97,996 | 97,996 | 0 |
| 18 | 334 | 334 | 0 |
| 22 | 334 | 334 | 0 |
| 30 | 334 | 333 | 1 |
| 36 | 334 | 334 | 0 |
| 44 | 334 | 334 | 0 |
| 60 | 334 | 334 | 0 |

## Constraints

The synchronous harness records a 7.28-second worst-case HARD search. Production
work runs off the main thread and has a five-second deadline, so such an outlier
is discarded without player cost. The earlier 990,690-run harness measures deal
quality rather than certified shuffle transactions and was not substituted for
this purpose; the new harness directly verifies 100,000 shuffle requests and can
be scaled with `SHUFFLE_COUNT`.
