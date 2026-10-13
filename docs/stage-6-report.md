# Stage 6 — Reading sessions and adaptive repetition

Date: 2026-10-13. Scope: the user's explicit authorization to perform all remaining stages 6–8 without intermediate approval.

Status: implementation, automated checks, GitHub Actions deployment and published mock verification complete. Mandatory real Android/model acceptance remains outstanding.

## Implemented work

- Added ReadingActions for explicit start, selection/resume, position saving and completion. Reader saves a sentence anchor plus offset after a 300 ms scroll pause and flushes on visibility/pagehide/navigation. Selection persists through AppSettings.activeSessionId, including older history texts.
- Added the Russian Complete reading button. Completion reads current records, applies pure Domain rules and writes Completed state, vocabulary and WordExposure in one IndexedDB transaction. Duplicate completion returns the existing session. Pending lookup intents must be resolved or canceled first.
- Generation prompt v2 receives up to 30 oldest active unknown entries and returns grounded occurrence candidates. Domain verifies canonical expressions and token boundaries in actual sentences, excludes uncertain meanings and duplicated lemmas, and freezes session review candidates.
- Effective marks respect undo facts. Confirmed untapped prior words become Learned; marked, absent and first-session words remain Unknown. Later explicit marks are preserved across interrupted sessions. Undoing an earlier session mark cannot erase a newer mark elsewhere.
- Later explicit rereading uses existing verified contextual cards as occurrence evidence, including forms skipped by fresh generation matching. Untapped prior words can become Learned without rewriting the document or making AI requests.
- Added local per-word mark/undo/repetition history through indexed repository queries. Completed learning cannot be undone, and late autosave cannot modify it.
- Added ordered migration 3 for selected-session preferences and vocabulary-history indexes, preserving existing data and original localStorage connection settings.

Changed modules: Domain completion/occurrences, ReadingActions, generation/provider contracts and prompt, learning repository/adapter/schema, Reader/position hook, App composition, vocabulary history, tests and documentation.

## Verification and acceptance evidence

The shared final batch passes `npm run check`: strict application/Domain types, lint, formatting, architecture, 158 unit/integration tests across 11 suites, and production build. Reading-cycle tests cover transitions, candidate certainty, first-session protection, undo, absent words, later marks, completion rollback, competing completions, late position writes, durable pending intents and explicit rereading. Actual v1/v2 upgrades and failed v2-to-v3 rollback pass.

Production mobile Chromium checks verify tab closure/reopening with marks and position, generation context, first-session Unknown, later confirmed Learned, unchanged facts after refresh, completed history, explicit rereading and pending-intent completion blocking. All API results are mocked; no real OpenAI request is made.

Every stage 6 algorithm criterion has automated evidence. Real German/model sense correctness and phone recovery/gestures remain manual acceptance, described in [testing.md](testing.md). Occurrence detection intentionally skips unverified inflections and separated components; cards still explain them. Abrupt OS termination can lose movement since the last committed position save. Deployment evidence is tracked in [stage 8](stage-8-report.md).

## Published verification

Code commit `3d6d3e3` passed GitHub Actions build checks and Pages deployment: [run 38359915214](https://github.com/serssp/vibe/actions/runs/38359915214). The JS/CSS asset hashes served by [serssp.github.io/vibe](https://serssp.github.io/vibe/) match the locally verified production build.

All eight daily-workflow groups passed separately against the published site in isolated mobile Chromium: tab/session/position recovery, atomic learning, completed history and explicit rereading, JSON download/validation/cancellation/restore, unresolved marks, contextual rereading, per-word facts and 502-document pagination, and enlarged layout. The large-history scenario completed in about 2 seconds in this environment. API responses were intercepted and mocked; no valid key or real OpenAI model request was used. This is published browser verification, not physical Android or real-model acceptance.
