# Stage 8 — MVP stabilization

Date: 2026-10-13. Scope: the user's explicit authorization to perform all remaining stages 6–8 without intermediate approval.

Status: implementation, automated checks, GitHub Actions deployment and published mock verification complete. Mandatory real Android/model acceptance remains outstanding.

## Stabilization and changes

- Preserved generation, contextual word cards, separate senses, grammar, gestures and offline caches while adding complete reading cycles, history and recovery.
- Added daily production browser scenarios for tab closure, saved position, completion, read-only completed history, explicit rereading, local learning facts and actual backup downloads/imports.
- Verified conservative repetition, transaction races and rollback, selected older texts after refresh, failed word actions, enlarged fonts, paged history and legacy schema updates.
- Corrected late undo of completed reading, cross-session undo that could erase a newer mark, rereading of previously marked words using saved contextual evidence, and chronological comparisons across UTC timestamps with/without milliseconds.
- Updated README, architecture, data model, testing, feature documentation, AGENTS and ADR 0002. Requirements and implementation-plan text remain unchanged.

## Verification boundaries

| Check                     | Evidence                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check`           | Both strict typechecks, lint, formatting, architecture, 158/158 tests across 11 suites and production build pass                                             |
| `npm run test:browser`    | 26 scenario groups across four suites: settings/connection, native storage, generation/word/grammar gestures, daily reading/history/backups; mocked API only |
| Updates and data recovery | Actual v1/v2 migration preservation, failed v2-to-v3 rollback, atomic completion/import, recovered tab/session/marks/position                                |
| Large history             | 2000-document integration fixture; 502-document browser restore with 20/40-row pagination; elapsed time printed by browser test                              |
| Secret isolation          | Separate key storage, strict export shapes, dummy key absent from downloads; repository/build scan performed before publication                              |
| Real OpenAI               | Not performed; no valid key or real user-model request used                                                                                                  |
| Android Chrome            | Not performed on a physical phone; native Chromium touch input and mobile viewport are synthetic                                                             |
| iOS Safari                | Not manually verified                                                                                                                                        |
| GitHub Actions / Pages    | [Run 38359915214](https://github.com/serssp/vibe/actions/runs/38359915214) passed build and deployment for `3d6d3e3`; published browser checks also passed   |

Mandatory Android gestures and real-model quality remain open. Therefore stage 8 is implemented and automatically stabilized but is not fully accepted under the plan's definition of done. [testing.md](testing.md) contains the real-device steps. No backend, new external scripts, source comments or additional production dependencies were introduced.

## Published verification

Code commit `3d6d3e3` passed GitHub Actions build checks and Pages deployment: [run 38359915214](https://github.com/serssp/vibe/actions/runs/38359915214). The JS/CSS asset hashes served by [serssp.github.io/vibe](https://serssp.github.io/vibe/) match the locally verified production build.

All eight daily-workflow groups passed separately against the published site in isolated mobile Chromium: tab/session/position recovery, atomic learning, completed history and explicit rereading, JSON download/validation/cancellation/restore, unresolved marks, contextual rereading, per-word facts and 502-document pagination, and enlarged layout. The large-history scenario completed in about 2 seconds in this environment. API responses were intercepted and mocked; no valid key or real OpenAI model request was used. This is published browser verification, not physical Android or real-model acceptance.
