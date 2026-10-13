# Stage 2 — report

Date: 2026-10-13. Scope: learning data models and IndexedDB. The user accepted stage 1 and authorized stage 2 with the instruction, translated from Russian, "Execute the next stage."

Status: stage 2 was accepted when the user authorized stages 3–5 together on 2026-10-13. The checks below describe the stage 2 snapshot. The current reports are stage-3-report.md, stage-4-report.md and stage-5-report.md.

## Changes

- Added pure Domain contracts for TextDocument, ReadingSession, VocabularyEntry, WordInteraction, WordExposure, GrammarExplanation, and AppSettings, with runtime structural validation and stable relationship/sentence IDs.
- Added the Application LearningRepository port with typed reads and atomic batch commits. The native IndexedDB adapter is composed only in `app/create-services.ts` and opens lazily.
- Added database `vibe.learning`, schema version 1, migration 1, and unique indexes for vocabulary senses, undo targets, session/vocabulary exposures, and grammar cache keys.
- Enforced reference checks and immutable stored facts within the same write transaction. Identical repeated writes are safe; invalid records, conflicts, or request failures roll back the whole batch.
- Added safe storage errors, ordered migration execution, blocked/versionchange handling, and rollback without destructive fallback.
- Added development-only fake-indexeddb tests and separate native Chromium checks; existing production UI checks remain part of the required browser command and CI.
- Updated AGENTS, README, architecture, and stage 1 acceptance; added data-model and testing documentation. Preserved pre-existing local documentation edits and left requirements/implementation-plan contents unchanged during this stage.

## Data and scope

The API key remains under `vibe.openai-api-key`; the existing model remains under `vibe.openai-model`. Exportable AppSettings has no credential field, and unsupported fields are rejected. No previous learning database existed; migration 1 creates the initial schema. The current settings UI does not yet write learning preferences or learning records.

Stage 2 stores facts and provides transaction primitives; generation, vocabulary lookup, grammar requests, completion/status algorithms, history UI, and import/export remain stages 3–7. Native browser tests use synthetic records and make no OpenAI requests.

## Verification

| Check                     | Result                                                                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`           | Passed: both strict typechecks, lint without warnings, formatting, architecture, 97/97 tests across 6 suites, and production build                                                                                |
| Domain isolation          | Separate typecheck without DOM/Node.js ambient types passed                                                                                                                                                       |
| Architecture              | No violations: 26 modules, 52 dependencies, including type-only imports                                                                                                                                           |
| `npm run test:browser`    | Passed: 6 existing production UI groups plus 4 native IndexedDB groups in Chromium 390×844                                                                                                                        |
| Native IndexedDB reload   | All seven entity categories restored unchanged after page reload; sentence IDs and position preserved; repeated commits produced one interaction and exposure                                                     |
| Atomicity                 | Reference and index failures rolled back entire batches; native unique-index failure preserved previous vocabulary and exposure data                                                                              |
| Concurrency               | Competing writes in two native browser tabs allowed exactly one exposure; fake-indexeddb tests also verified concurrent repeated/competing writes                                                                 |
| Migration safety          | Initial schema, ordered upgrades, destructive and asynchronous migration failures, missing/future versions, blocked opens and versionchange tested; native failed upgrade preserved schema v1 and the stored text |
| Secret/build scan         | No OpenAI key patterns found in src/tests/dist/.github/docs; dummy credentials, test fixtures and fake-indexeddb absent from dist                                                                                 |
| GitHub Actions/deployment | Not run for stage 2; existing workflow invokes the expanded tests before deployment                                                                                                                               |
| Real OpenAI requests      | None made; connection tests use mock transport and storage tests block the API                                                                                                                                    |
| Real Android Chrome       | Not checked for this version; automated mobile Chromium does not replace a real phone                                                                                                                             |
| Requirements/plan         | Existing local edits preserved; neither document was modified by stage 2 work                                                                                                                                     |

No backend or production storage dependency was added. Native storage tests run against source modules on a dedicated Vite server; production UI checks separately run against the built `/vibe/` preview. These are local results, not evidence for the currently deployed version.

## Acceptance criteria

| Plan criterion                                       | Evidence                                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entities can be saved and retrieved                  | All seven entities verified by repository and native browser tests                                                                               |
| Data survives a page refresh                         | Native IndexedDB reads after page reload match the original records                                                                              |
| Entity references remain valid                       | Same-transaction checks reject missing and mismatched text, sentence, session, vocabulary, undo and exposure references with full rollback       |
| Repeated operations do not create invalid duplicates | Identical IDs/records are idempotent; unique indexes reject duplicate senses, exposures, undos and grammar cache keys                            |
| Transactions and migrations are tested               | Fake IndexedDB integration suite and native Chromium rollback/concurrency/upgrade checks passed                                                  |
| Key is absent from exportable learning data          | Domain AppSettings has no key; runtime validation rejects extra fields, including nested arrays; separate localStorage compatibility checks pass |

All stage 2 acceptance criteria have local automated evidence. The current UI remains the connection/settings screen, so learning-data workflows are exercised through the repository tests. GitHub Actions deployment and real Android verification remain unverified for this version. Stage 3 requires user acceptance of this report; work stops here.
