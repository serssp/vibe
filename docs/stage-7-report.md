# Stage 7 — History and export/import

Date: 2026-10-13. Scope: the user's explicit authorization to perform all remaining stages 6–8 without intermediate approval.

Status: implementation and automated verification complete. Real Android/model acceptance remains outstanding; deployment evidence will be recorded after publication.

## Implemented work

- HistoryList shows title, date, CEFR, duration, status and number of sessions, grouping document history separately from reading sessions. Initial rendering is limited to 20 rows, with more available; storage retains every record.
- Unfinished texts resume their saved session. Completed texts display plain word spans and preserve progress. An explicit new-reading action creates a separate session; grammar remains accessible while viewing.
- BackupActions export strict `vibe-learning` version 1 JSON with all learning collections, settings, pending intents and contextual caches. The key and separate connection settings are excluded.
- BackupPanel downloads JSON, validates an imported file, previews its counts and requires explicit replacement confirmation. Canceling or selecting a file performs no replacement.
- Pure snapshot validation checks complete shapes, format/version, IDs, index identities, references, undo targets, exposure/session relationships, contextual cache keys and grammar fragments. The adapter copies and revalidates the preview, then clears and writes all learning stores in one transaction. Any failure rolls back the replacement.

Changed modules: HistoryList/BackupPanel, BackupActions, Domain snapshot validation, LearningRepository snapshot/replacement, App composition, vocabulary pagination/history, tests and documentation.

## Verification and acceptance evidence

The shared checks pass: 157 unit/integration tests, production build, architecture and browser suites. Backup tests cover complete and empty round trips, supported UTC date variants, invalid shapes/versions/identities/references, secret-field rejection, mutated previews and rollback after a synthetic storage capacity failure. An integration fixture retains 2000 documents and sessions.

Production Chromium downloads an actual backup file, confirms absence of the dummy credential, rejects invalid references, cancels a valid preview, confirms restoration, and verifies recovered sessions/exposures/caches and preserved connection key. Viewing completed history does not create AI requests or change learning facts. The browser also restores 502 documents and verifies initial 20-row rendering and expansion to 40.

All stage 7 functional criteria have automated evidence. Real-phone file selection/download and recovery remain manual checks. Backups contain complete local learning data; device synchronization and offline startup remain outside the MVP. Deployment evidence is tracked in [stage 8](stage-8-report.md).
