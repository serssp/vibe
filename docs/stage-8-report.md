# Stage 8 — MVP stabilization

Date: 2026-10-13. Scope: the user's explicit authorization to perform all remaining stages 6–8 without intermediate approval.

Status: implementation and automated verification complete. Real Android/model acceptance remains outstanding; deployment evidence will be recorded after publication.

## Stabilization and changes

- Preserved generation, contextual word cards, separate senses, grammar, gestures and offline caches while adding complete reading cycles, history and recovery.
- Added daily production browser scenarios for tab closure, saved position, completion, read-only completed history, explicit rereading, local learning facts and actual backup downloads/imports.
- Verified conservative repetition, transaction races and rollback, selected older texts after refresh, failed word actions, enlarged fonts, paged history and legacy schema updates.
- Corrected late undo of completed reading, cross-session undo that could erase a newer mark, and chronological comparisons across UTC timestamps with/without milliseconds.
- Updated README, architecture, data model, testing, feature documentation, AGENTS and ADR 0002. Requirements and implementation-plan text remain unchanged.

## Verification boundaries

| Check                     | Evidence                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`           | Both strict typechecks, lint, formatting, architecture, 157/157 tests across 11 suites and production build pass                   |
| `npm run test:browser`    | Four suites: settings/connection, native storage, generation/word/grammar gestures, daily reading/history/backups; mocked API only |
| Updates and data recovery | Actual v1/v2 migration preservation, failed v2-to-v3 rollback, atomic completion/import, recovered tab/session/marks/position      |
| Large history             | 2000-document integration fixture; 502-document browser restore with 20/40-row pagination; elapsed time printed by browser test    |
| Secret isolation          | Separate key storage, strict export shapes, dummy key absent from downloads; repository/build scan performed before publication    |
| Real OpenAI               | Not performed; no valid key or real user-model request used                                                                        |
| Android Chrome            | Not performed on a physical phone; native Chromium touch input and mobile viewport are synthetic                                   |
| iOS Safari                | Not manually verified                                                                                                              |
| GitHub Actions / Pages    | Publication pending at report creation; results will be recorded after deployment                                                  |

Mandatory Android gestures and real-model quality remain open. Therefore stage 8 is implemented and automatically stabilized but is not fully accepted under the plan's definition of done. [testing.md](testing.md) contains the real-device steps. No backend, new external scripts, source comments or additional production dependencies were introduced.
