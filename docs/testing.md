# Testing strategy

Status: stages 3–5. Automated checks never use a valid OpenAI key or make real OpenAI requests.

## Required local and CI checks

Run `npm run check`, then `npm run test:browser`. The first command runs application and pure-Domain typechecks, lint, formatting, dependency checks, Vitest, and the production build. GitHub Actions runs those checks plus browser tests before deploying. `npm ci` installs the development-only `fake-indexeddb` test dependency from the lockfile.

## Automated test coverage

| Suite                       | Coverage                                                                                                                                                                                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| connection/settings         | Mock AI success/failure/cancellation, safe errors, explicit requests, original localStorage names and key deletion                                                                                                                                                                |
| architecture                | Actual analyzer/linter restrictions: allowed dependency directions, type-only cycles, prohibited UI/Application/Domain IO                                                                                                                                                         |
| learning-validation         | Complete record shapes, levels/durations, UTC dates, lifecycle metadata, counters, sentence IDs/content, extra fields and key exclusion                                                                                                                                           |
| learning-storage            | All entity reads/writes, reopen persistence, stable sentence IDs, isolated snapshots, distinct senses, immutable facts, atomic reference validation, unique indexes, undo targets, concurrent writes                                                                              |
| learning-migrations         | Initial schema, ordered upgrades preserving data, failed destructive upgrade rollback, asynchronous index failure, missing/future versions, blocked requests, versionchange and retries                                                                                           |
| production browser          | `/vibe/` assets, mobile layout, refresh and settings persistence, mock connection results/errors/loading, retry and key deletion                                                                                                                                                  |
| native IndexedDB browser    | All entities persist after reload; key stays separate; repeated writes; unique-index transaction rollback; competing writes across two tabs; failed upgrade recovery                                                                                                              |
| generation                  | Atomic save/restore, stable sentence IDs, cancellation, concurrent-action prevention, invalid responses, recent topics, preserved typography preferences                                                                                                                          |
| learning-actions            | Durable failed lookups and retries, independent contextual senses, verified ging/gehen association, repeated marks, out-of-order/idempotent undo, learned-state restoration, concurrent resolution/counters, grammar cache keys and error isolation                               |
| structured-ai               | Strict Responses payloads, credentials excluded from request context, prompt versions, invalid shapes, noun gender, separable forms, candidate IDs, refusals and abort                                                                                                            |
| production learning browser | Selection/generation/refresh, invalid AI and storage failure, native word taps, contextual cards and undo, failed intent after reload, native long hold, accessible keyboard actions, movement/scroll/cancel, synthetic-click suppression, offline cache and enlarged-font layout |

Repository integration tests use a fresh `fake-indexeddb` factory per fixture, with no global browser dependency. The application ships migrations 1 and 2. A regression test upgrades real schema v1 data to v2 without changing original records. Additional failing/synthetic migrations in fixtures verify runner rollback without shipping hypothetical application migrations.

`tests/browser-check.mjs` runs against production preview on port 4173. `tests/storage-browser-check.mjs` serves source modules and synthetic fixtures through Vite on port 4174, then exercises native Chromium IndexedDB. Synthetic data and test modules are absent from the production build. The second suite validates browser transaction behavior, while the first verifies the actual production UI. `tests/learning-browser-check.mjs` separately runs generation/vocabulary/grammar against production preview, using mocked Responses payloads and Chromium native touch input through CDP. It verifies that scroll and cancelled pointers cannot produce synthetic-click analysis. All scripts use isolated browser contexts and shut down their servers. Test screenshots in this environment are saved under `/tmp/vibe-stage3-5`; they contain only mock records.

## Verification limits and manual checks

Chromium at 390×844 is an automated mobile viewport check, not a real Android Chrome verification. Tests use synthetic learning records and mocked AI results. They verify browser gestures and application contracts, but do not assess the quality of real generated German, model sense matching, CEFR accuracy, or real-device touch behavior. The learning/completion algorithm remains stage 6.

Android Chrome checks must be reported separately. Generation, vocabulary and grammar are now testable through the UI. Real OpenAI requests and real Android gestures remain separate manual checks; automated success does not complete those acceptance criteria. A successful local check does not prove deployed GitHub Actions or a published version; report each separately.

Real OpenAI requests require an explicit user action. `npm run check:cors` is a separate real-network diagnostic with an intentionally invalid key; it is excluded from required checks and CI. Do not log keys or copy them into fixtures, screenshots, reports, exports, or builds.

## Manual stages 3–5 acceptance

Use this version on a real Android Chrome device. Save a valid key/model locally, generate each intended level/duration, and assess German coherence, length and CEFR. Refresh and confirm the same text returns without another request. Tap inflected words and nouns, verify the contextual Russian meaning and article/gender, undo an accidental tap, and check vocabulary after refresh. Compare distinct meanings of the same spelling and a separable verb or fixed expression.

Hold a word for about 500 ms: the whole sentence should be highlighted with a Russian explanation and no vocabulary mark. Check short taps, scrolling, movement, cancellation and the system context menu; use the sentence-analysis button as an alternative. Retry after disabling/restoring connectivity and confirm failed word marks remain available. Do not put the key into feedback. Record real requests, phone/browser version, and device observations separately from mocked tests. Stages 2–5 have been deployed and separately checked in published Chromium with mock API responses. The current stage reports link the successful CI/deployment run. Real OpenAI content and a real Android device still require the manual checks above.
