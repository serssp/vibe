# German Learning App — Technical Specification

**Version:** 0.5\
**Status:** Draft\
**Purpose:** the primary requirements document for Codex.

English UI labels in this document are translations of the Russian labels. Translating this document does not request a change to the application's UI language.

## 1. Product goal and scope

A personal web application for learning German through adaptive reading, comprehension practice, vocabulary development, and grammar study.

- One user; registration, authentication, and multi-user support are not required.
- Generate coherent German texts at A1, A2, or B1 level.
- Choose a reading duration of 3, 4, or 5 minutes.
- A short tap on a word opens a vocabulary card with a Russian translation.
- A long press on a sentence opens a grammar explanation in Russian.
- Tapping unfamiliar words builds a personal vocabulary; those words should recur in subsequent texts where possible.
- The user completes reading with a dedicated button.
- Store texts, reading sessions, vocabulary, events, and history.
- Features will expand gradually; do not implement future features prematurely.

## 2. Platform and technology constraints

- Web application only, optimized for smartphones (mobile-first).
- Primary browser: Android Chrome; support iOS Safari where possible.
- Hosting: GitHub Pages, static HTML/CSS/JS, deployed through GitHub Actions.
- Support a repository subpath in the site URL, such as /vibe/.
- No backend or server-side database is required for the MVP.
- TypeScript with strict mode enabled; a component-based, testable UI.
- Codex generates and modifies all code; the user defines requirements and tests the application.
- Do not write comments in source code. Document important decisions separately.
- Use simple, widely adopted technologies and avoid unnecessary infrastructure.

## 3. OpenAI and prompts

### 3.1. API access

- The user enters an OpenAI API key in the application settings.
- Direct browser requests are permitted for the MVP; the user knowingly accepts the risk of key compromise.
- Persist the key locally between sessions; allow it to be replaced or deleted.
- Never include the key in source code, Git, URLs, logs, data exports, or build artifacts.
- Prefer a separately created key with any available budget or spending limits.
- The OpenAI model must be configurable.
- The architecture must allow replacing the browser-side API with a backend proxy without changing Domain or UI.

### 3.2. AI Provider

All requests go through a single AI Provider. Its responsibilities include collecting context, selecting the model, HTTP/SDK access, request cancellation, timeouts, limited retries, deduplication, error handling, and response validation. UI and Domain must not call OpenAI directly. AI errors must not corrupt local data.

### 3.3. Prompt registry

All prompts are written **in English** and stored separately from business logic:

- `src/prompts/text-generation.md`
- `src/prompts/word-translation.md`
- `src/prompts/grammar-explanation.md`

Define each prompt's purpose, input parameters, output format, constraints, and version. Version prompt files in Git. Store the model and prompt version with generated texts and explanations. Prefer Structured Outputs with JSON Schema and runtime validation.

### 3.4. Cost efficiency and failures

- Cache successful translations and grammar explanations.
- Do not create AI requests on re-render.
- Prevent uncontrolled retries and parallel requests for the same action.
- Show progress indicators, understandable errors, and an option to retry.
- Track token usage when the API provides it; do not expose the key in diagnostics.

## 4. Text generation

The user selects **A1, A2, or B1** and a duration of **3, 4, or 5 minutes**, then presses **Generate text**.

The text must be natural, coherent, and interesting, with vocabulary and grammar appropriate to the selected level. Its length should roughly match the reading duration. Vary topics without repeatedly using the same storyline. Where possible, include active unfamiliar words naturally and with the appropriate meaning. Do not insert translations into the German text itself.

AI receives the CEFR level, target duration, vocabulary for review, and recent topics when needed. Generation returns a structured document that can be validated. Segment the text into sentences with stable IDs.

**Important:** a word counts as repeated only when its presence in the actual generated text is confirmed, not merely because it was supplied to AI in the prompt. Do not automatically count ambiguous matches.

## 5. Interactive reading

### 5.1. Reader

Provide readable text with large typography, sufficient line spacing, adaptive width, normal vertical scrolling, and support for system font scaling. Automatically save the reading position and user actions; restore unfinished reading after a page refresh or browser unload.

### 5.2. Tap: word translation

A short tap on a word opens a card on the current screen containing:

- the lemma;
- its Russian translation and meaning in the current context;
- its part of speech;
- for a noun: its article and grammatical gender;
- information about the word form when needed.

A tap means that the user does not know or cannot remember the word. Record the event and associate the vocabulary entry with the specific surface form and sentence. Record repeated taps. Do not merge different meanings of the same spelling without verification. Account for inflection, separable verbs, and multiword expressions. Allow an accidental tap to be undone.

### 5.3. Long press: grammar explanation

Holding for approximately 500 ms within a sentence selects the entire sentence, highlights it, and opens a grammar analysis in Russian.

- Explain the constructions used and why the particular forms occur.
- Identify the relevant parts of the sentence.
- Match the selected CEFR level without excessive terminology.
- Provide short German examples with translations when needed.
- A grammar action does **not** add words to the vocabulary.
- Cache explanations based on text, sentence, level, model, and prompt version.

Tap and long press are mutually exclusive; a long press must not also trigger a vocabulary lookup. Cancel gesture recognition when the finger moves or scrolling starts. Avoid the system context menu in the interactive area without disrupting scrolling. Provide an accessible alternative for requesting a sentence analysis.

**Agreed primary UI:** short tap for a word, long press for a sentence. A separate mode toggle was proposed but **not approved**; do not replace these gestures with a toggle without agreement.

## 6. Reading sessions and learning

Each reading is a ReadingSession with status New, InProgress, or Completed, a reference to a TextDocument, start/end times, and a saved position. One active session per text is sufficient for the MVP. AI requests may run on demand; they must not block autosave.

Place a **Complete reading** button below the text.

MVP completion algorithm:

1. Mark the session Completed and record its completion time.
2. Identify previously unfamiliar words that reliably occurred in this text.
3. If the user tapped a word in the current session, it remains Unknown.
4. If a previously unfamiliar word occurred but was not tapped, it becomes Learned.
5. If a word did not occur, its status does not change.
6. A word first marked in the current session cannot become Learned when that same session is completed.
7. A Learned word may become Unknown again after a subsequent explicit tap.
8. Record interaction and repetition history separately from the computed status.

Session completion and related learning-state changes must be atomic and idempotent. Repeated presses of **Complete** must not award results again. An unfinished session must not count untapped words as learned.

A stricter vocabulary consolidation algorithm may be introduced later, so store facts and history rather than only a state field.

## 7. History

Show recent generated texts with title, date, CEFR level, duration, and reading status. Allow previously generated texts to be viewed and unfinished sessions to be resumed. Store history without a fixed limit, subject to local storage capacity.

Reopening a completed text for viewing does **not** change previously computed progress; starting a new learning session requires a separate explicit action. Document history and session history are distinct entities.

## 8. Architecture

### 8.1. Style

A **modular frontend monolith** with these layers:

- **Presentation:** components, navigation, gestures, UI state, and rendering.
- **Application:** GenerateText, LookupWord, ExplainGrammar, StartReading, ResumeReading, CompleteReading, ExportData, and ImportData use cases.
- **Domain:** models and rules for vocabulary, repetition, events, and session completion.
- **Infrastructure:** AI adapter, IndexedDB adapter, Prompt Registry, import/export, and local diagnostics.

Required boundaries:

- UI must not access OpenAI or IndexedDB directly.
- Domain must not depend on a UI framework, OpenAI SDK, IndexedDB, or Infrastructure.
- Infrastructure implements interfaces used by application use cases.
- No circular dependencies.
- Do not introduce microservices, an event bus, or a plugin framework without a concrete need.
- Use shared modules only for logic shared by multiple parts of the application.

### 8.2. Suggested modules

Reader, Vocabulary, Grammar, History, Settings, Learning Domain, AI Provider, and Storage. Codex may change the source layout while preserving these boundaries.

Suggested structure:

```text
src/
  app/
  features/
    reader/
    vocabulary/
    grammar/
    history/
    settings/
  application/
    use-cases/
  domain/
    reading/
    vocabulary/
    learning/
  infrastructure/
    ai/
    storage/
    export/
  prompts/
    text-generation.md
    word-translation.md
    grammar-explanation.md
  shared/
tests/
docs/
  adr/
```

## 9. Data model

All entities have stable IDs; timestamps use ISO 8601/UTC; relationships use IDs. Version the IndexedDB schema and export format.

### TextDocument

- `id`: unique ID.
- `title`, `content`: title and full German text.
- `sentences`: ordered sentences with stable IDs.
- `cefrLevel`: A1/A2/B1.
- `targetDuration`: 3/4/5 minutes.
- `createdAt`, `aiModel`, `promptVersion`.
- `targetVocabularyIds`: words sent to the model for review.
- `includedVocabularyIds`: words reliably detected in the text.

### ReadingSession

- `id`, `textId`.
- `status`: New/InProgress/Completed.
- `startedAt`, `completedAt`.
- `readingPosition`.
- `reviewCandidateIds`: active vocabulary entries to review in this session.

### VocabularyEntry

- `id`, `lemma`, `partOfSpeech`, `article`.
- `meaningRu`, `senseKey` for distinct meanings.
- `status`: Unknown/Learned — computed state.
- `createdAt`, `lastMarkedAt`, `unknownCount`, `exposureCount`.

Do not use spelling alone as the unique key: distinguish lemmas, surface forms, meanings, separable verbs, and fixed expressions.

### WordInteraction

An immutable record of a specific user action:

- `id`, `sessionId`, `textId`, `vocabularyEntryId`.
- `surfaceForm`, `sentenceId`.
- `action`: MarkUnknown/UndoMarkUnknown.
- `timestamp`.

### WordExposure

A confirmed occurrence of a studied word in a completed session:

- `id`, `sessionId`, `vocabularyEntryId`.
- `markedUnknown`, `occurredAt`.

At most one entry per sessionId/vocabularyEntryId pair; create it at completion only for confirmed repetitions.

### GrammarExplanation

- `id`, `textId`, `sentenceId`, `cefrLevel`.
- `explanation` (structured rules and examples).
- `aiModel`, `promptVersion`, `createdAt`.

### AppSettings

Preferences for CEFR level, duration, AI model, and UI settings. Store the API key separately from exportable learning data.

### Invariants

- Completing a session again does not produce duplicate results.
- New words do not become Learned in their first session.
- Stored events explain changes to a word's status.
- Words absent from the text do not receive WordExposure records.
- AI failure or cache deletion does not change learning history.
- Stored texts do not change when prompts change.
- Learning results and session completion are written atomically.

## 10. Persistence and recovery

- **IndexedDB:** documents, sessions, vocabulary, interactions, exposures, and explanations.
- **localStorage is permitted:** small settings and the API key entered by the user.
- Save word marks immediately; save the reading position periodically.
- Application updates must not delete data.
- New schemas require migrations and automated tests.
- A migration failure must not silently reset the old database.
- Export versioned JSON containing all learning data, excluding the API key.
- Import only after validating the schema, version, and referential integrity; an invalid import must not damage existing data.
- The MVP may support full restore by replacing local data after confirmation.
- Device synchronization is not required: the application will be used on one phone.
- The user accepts the risk of losing local data when clearing browser storage or losing the device.

## 11. Nonfunctional requirements

### Performance

- Local actions must remain responsive; opening saved texts must not create new AI requests.
- Network operations must not block UI; show loading state and understandable errors.
- Reuse cached results when request parameters match.
- Limit parallel requests and retries.

### Reliability

- Page refresh or browser unload must not lose saved words or sessions.
- Learning-progress changes must be consistent and safe to repeat.
- Migrations, imports, and partial network failures must not corrupt data.

### Security

- A browser-side API key is an accepted risk, not a protected secret.
- Do not store the key in the repository, builds, URLs, logs, or exports.
- Do not render AI-generated HTML as trusted content; prevent XSS.
- Do not load third-party scripts without a concrete need.

### UX and accessibility

- Mobile-first, comfortable one-handed use, and large touch targets.
- Readable German texts, adaptive typography, and sufficient contrast.
- Cards preserve the context of the current sentence.
- Scrolling must not trigger unintended tap/long-press actions.
- Support font scaling and an alternative to long press.

### Offline

- AI generation and analysis require a network connection.
- Locally saved documents remain available without another AI request if the application is already open.
- Fully offline startup is not mandatory for the MVP.

### Diagnostics and cost

- Diagnose AI, validation, storage, and migration errors locally without exposing secrets.
- Do not issue requests from the render path; cache and deduplicate requests.
- Track token usage where possible.
- Do not introduce server-side monitoring for the MVP.

### Maintainability

- TypeScript strict, linting, formatting, and automated unit/integration/UI checks.
- Separate UI, use cases, Domain, and Infrastructure; avoid duplication.
- Source comments are not required; document important decisions separately.

## 12. Testing

**Unit:** repetition/status algorithms, lemma normalization, WordInteraction and WordExposure, and idempotent completion.

**Integration:** text generation/storage, vocabulary AI mock, grammar, session recovery, IndexedDB migrations, and export/import.

**UI/E2E:** word taps, sentence long presses, cancellation during scrolling, loading, network errors, persistence after refresh, and primary mobile scenarios.

Manual testing on a real Android phone is required for gesture behavior. Use a mock AI Provider in automated tests.

## 13. CI/CD

GitHub Actions: install dependencies → typecheck → lint → tests → production build → GitHub Pages deployment. Deploy only after all required checks pass. Do not include secrets in artifacts.

## 14. Codex documentation

Maintain:

- `README.md`: startup and deployment.
- `docs/requirements.md`: this specification.
- `docs/implementation-plan.md`: MVP stages.
- `docs/architecture.md`: layers and dependencies.
- `docs/data-model.md`: entities, invariants, and migrations.
- `docs/testing.md`: testing strategy.
- `docs/adr/`: short records of significant architectural decisions.
- `AGENTS.md`: Codex working rules.

Do not create duplicate documents. Update tests and documentation when behavior changes. Do not change data without a migration. Do not rewrite existing modules unnecessarily.

## 15. Future extensions (outside the MVP)

Comprehension checks, grammar exercises, statistics, spaced repetition, text-to-speech, conversational practice, adaptive difficulty, and synchronization. The architecture must allow these without implementing them prematurely.

## 16. Open questions

- The specific OpenAI model.
- How text topics are selected.
- Semantics of starting a new learning session when rereading a completed text.
- Future comprehension checks.
- An alternative grammar-analysis UI when long press is unavailable.
