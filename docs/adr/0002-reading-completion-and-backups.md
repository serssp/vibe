# ADR 0002 — Reading completion, conservative repetition and backups

Date: 2026-10-13. Status: implemented in the accepted MVP.

## Context

Reading completion changes multiple stores and may race with autosave or another tab. Vocabulary sense matches are contextual; merely supplying a word to generation does not prove it appeared. Completed-text viewing must preserve learning progress, and restoring backups must not destroy the current database on partial failure.

## Decision

Expose explicit repository methods for start, selection, position, completion, coherent snapshot and replacement. Run completion entirely within one IndexedDB transaction, using a pure Domain rule over current facts. Block completion while lookup intents remain Pending. Preserve immutable exposure/interaction facts and idempotent Completed sessions. Freeze review candidates at session start and preserve later marks from another interrupted session.

Ask generation prompt v2 for grounded occurrences. Count only exact canonical expressions present at token boundaries with explicit sense certainty, excluding duplicated normalized lemmas. Skip uncertain inflections and separated components rather than guessing progress. Vocabulary cards retain their existing contextual treatment of those forms. Review selection is capped at 30 oldest active unknown entries per generation, while stored vocabulary has no cap.

Viewing a completed text selects an existing session without marks; grammar remains accessible. Rereading for learning requires an explicit new session. Existing verified contextual cards can confirm occurrence in that unchanged text, so previously marked words can be reviewed without altering the generated document. Store activeSessionId in exportable AppSettings and add it with ordered migration 3, alongside vocabulary-history indexes. Keep the key and connection model under their original separate localStorage names.

Use a version 1 JSON envelope for all learning stores and preferences, including pending lookups and contextual caches. Validate before showing a replacement confirmation. Revalidate a copied snapshot at restore time and clear/write every store within one transaction. Preserve current data on any failed replacement. Use UI pagination of 20 rows without truncating storage.

## Consequences

Transactions serialize competing updates and allow recovery from capacity/constraint failures. Conservative matching can miss real repetitions; it avoids automatic awards for uncertain meanings. Stable sentence-relative positions survive layout changes better than page offsets. Debounced autosave and pagehide remain best effort if the operating system kills the process. Automated native Chromium checks cannot establish real Android gestures or real model quality.
