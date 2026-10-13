# Stage 7 — History and export/import

Date: 2026-10-13. Scope: the user's explicit authorization to perform all remaining stages 6–8 without intermediate approval.

Status: implementation, automated checks, GitHub Actions deployment and published mock verification complete. Mandatory real Android/model acceptance remains outstanding.

## Implemented work

- HistoryList shows title, date, CEFR, duration, status and number of sessions, grouping document history separately from reading sessions. Initial rendering is limited to 20 rows, with more available; storage retains every record.
- Unfinished texts resume their saved session. Completed texts display plain word spans and preserve progress. An explicit new-reading action creates a separate session; grammar remains accessible while viewing.
- BackupActions export strict `vibe-learning` version 1 JSON with all learning collections, settings, pending intents and contextual caches. The key and separate connection settings are excluded.
- BackupPanel downloads JSON, validates an imported file, previews its counts and requires explicit replacement confirmation. Canceling or selecting a file performs no replacement.
- Pure snapshot validation checks complete shapes, format/version, IDs, index identities, references, undo targets, exposure/session relationships, contextual cache keys and grammar fragments. The adapter copies and revalidates the preview, then clears and writes all learning stores in one transaction. Any failure rolls back the replacement.

Changed modules: HistoryList/BackupPanel, BackupActions, Domain snapshot validation, LearningRepository snapshot/replacement, App composition, vocabulary pagination/history, tests and documentation.

## Verification and acceptance evidence

The shared checks pass: 158 unit/integration tests, production build, architecture and browser suites. Backup tests cover complete and empty round trips, supported UTC date variants, invalid shapes/versions/identities/references, secret-field rejection, mutated previews and rollback after a synthetic storage capacity failure. An integration fixture retains 2000 documents and sessions.

Production Chromium downloads an actual backup file, confirms absence of the dummy credential, rejects invalid references, cancels a valid preview, confirms restoration, and verifies recovered sessions/exposures/caches and preserved connection key. Viewing completed history does not create AI requests or change learning facts. The browser also restores 502 documents and verifies initial 20-row rendering and expansion to 40.

All stage 7 functional criteria have automated evidence. Real-phone file selection/download and recovery remain manual checks. Backups contain complete local learning data; device synchronization and offline startup remain outside the MVP. Deployment evidence is tracked in [stage 8](stage-8-report.md).

## Published verification

Code commit `3d6d3e3` passed GitHub Actions build checks and Pages deployment: [run 38359915214](https://github.com/serssp/vibe/actions/runs/38359915214). The JS/CSS asset hashes served by [serssp.github.io/vibe](https://serssp.github.io/vibe/) match the locally verified production build.

All eight daily-workflow groups passed separately against the published site in isolated mobile Chromium: tab/session/position recovery, atomic learning, completed history and explicit rereading, JSON download/validation/cancellation/restore, unresolved marks, contextual rereading, per-word facts and 502-document pagination, and enlarged layout. The large-history scenario completed in about 2 seconds in this environment. API responses were intercepted and mocked; no valid key or real OpenAI model request was used. This is published browser verification, not physical Android or real-model acceptance.
