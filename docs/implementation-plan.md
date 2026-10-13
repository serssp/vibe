# German Learning App — MVP Implementation Plan

**Version:** 1.0\
**Based on:** [Technical Specification v0.5](requirements.md)\
**Implementer:** Codex

## 1. Execution rules

- Execute stages 0–8 strictly in order. Do not advance automatically: each stage requires user acceptance.
- At the end of each stage, report completed work, changed modules, tests run, results, limitations, and readiness for acceptance.
- Do not implement requirements from future stages prematurely.
- Do not rewrite working modules unnecessarily; follow the layers in the specification.
- Codex writes all code without source comments. Maintain documentation and prompts separately.
- Storage schema changes require migrations and tests. Behavior changes require regression tests.
- Do not include the OpenAI key in Git, builds, logs, URLs, or exports.
- Write all AI prompts in English.
- Replace the AI Provider with a mock implementation in tests.
- Report blocking technical limitations; do not introduce a backend or change the architecture without agreement.

## Stage 0. Technical feasibility check

**Goal:** verify that a static GitHub Pages site can call the OpenAI API from a mobile browser.

**Work:**
- A minimal TypeScript project and production build.
- GitHub Actions and GitHub Pages deployment with the correct base URL (/vibe/).
- A minimal screen for entering and changing the OpenAI API key.
- A real OpenAI request directly from the browser; investigate CORS and available browser-side SDK/API support.
- Handle invalid keys and network errors.
- Initial README.md and AGENTS.md.

**Acceptance:**
- [ ] GitHub Pages opens in Android Chrome.
- [ ] The application loads correctly after a page refresh.
- [ ] OpenAI responds to a test request from the browser.
- [ ] An invalid key produces an understandable error.
- [ ] The key is absent from Git and build artifacts.
- [ ] CI builds and deploys the application.

**Outcome:** a minimal deployed site with verified AI integration. If direct requests are impossible, stop and report alternatives without introducing a backend unilaterally.

## Stage 1. Foundation and architecture

**Goal:** establish stable module boundaries.

**Work:**
- Select and document the frontend stack.
- TypeScript strict, linting, formatting, and unit tests.
- Presentation, Application, Domain, and Infrastructure layers.
- AI Provider and Storage Repository interfaces.
- Reader, Vocabulary, Grammar, History, and Settings structure.
- GitHub Actions: types, linting, tests, and build.
- docs/architecture.md.

**Acceptance:**
- [ ] Build and CI pass.
- [ ] Domain does not depend on React, the OpenAI SDK, or IndexedDB.
- [ ] UI does not call OpenAI or IndexedDB directly.
- [ ] No circular dependencies.
- [ ] The mobile application opens.
- [ ] The architecture is documented.

**Outcome:** an architectural foundation without implementing all features.

## Stage 2. Data model and IndexedDB

**Goal:** reliable persistence of learning data.

**Work:**
- TextDocument, ReadingSession, VocabularyEntry, WordInteraction, WordExposure, GrammarExplanation, and AppSettings entities.
- IndexedDB adapter and repositories, schema versioning, and an initial migration.
- Transactional operations, unique indexes, and stable sentence IDs.
- Separate API key storage.
- Unit and integration tests for storage and migrations.

**Acceptance:**
- [ ] Entities can be saved and retrieved.
- [ ] Data survives a page refresh.
- [ ] Entity references remain valid.
- [ ] Repeated operations do not create invalid duplicates.
- [ ] Transactions and migrations are tested.
- [ ] The key is absent from the exportable learning data model.

**Outcome:** a tested persistence layer.

## Stage 3. German text generation

**Goal:** the first complete user workflow.

**Work:**
- Main screen: A1/A2/B1, 3/4/5 minutes, and a generation button.
- English `src/prompts/text-generation.md` with CEFR, duration, review vocabulary, and topic diversity parameters.
- OpenAI requests through the AI Provider.
- Structured responses, runtime validation, errors, loading state, and prevention of unintended duplicate requests.
- Save TextDocument in IndexedDB.
- Segment texts into sentences with stable IDs.
- A mock provider for tests.

**Acceptance:**
- [ ] The user can select a level and duration.
- [ ] German text is generated and displayed on a smartphone.
- [ ] The document is saved and can be opened after a refresh.
- [ ] Invalid responses and API errors are handled.
- [ ] No accidental parallel generations.
- [ ] Re-rendering does not trigger new requests.

**Outcome:** generated and persisted texts.

## Stage 4. Word translation and vocabulary

**Goal:** interactive vocabulary learning.

**Work:**
- A short tap on an individual word.
- A card containing the lemma, Russian contextual translation, part of speech, gender and article for nouns, and grammatical form.
- English `src/prompts/word-translation.md`.
- VocabularyEntry, WordInteraction history, and cached cards.
- Handle multiple meanings, inflected forms, separable verbs, and multiword expressions.
- Allow an accidental mark to be undone.
- AI errors must not lose the user action or corrupt vocabulary.

**Acceptance:**
- [ ] A tap opens a vocabulary card with a contextual translation.
- [ ] Unfamiliar words persist between sessions.
- [ ] Repeated taps are stored as interactions.
- [ ] `ging` and `gehen` can be associated with the same lemma.
- [ ] Different meanings of a word are not automatically merged.
- [ ] Caching prevents unnecessary requests.
- [ ] Scrolling does not trigger accidental translations.

**Outcome:** a working personal vocabulary.

## Stage 5. Grammar analysis

**Goal:** explain the grammar of a selected sentence.

**Work:**
- A long press of approximately 500 ms on a word selects the entire sentence.
- Highlight the sentence and show an explanation panel in Russian appropriate to the CEFR level.
- Explain constructions and forms, with examples when needed.
- English `src/prompts/grammar-explanation.md`.
- Cache by sentence, level, model, and prompt version.
- Mutually exclusive tap/long press, cancellation during scrolling, and suppression of the system context menu.
- An accessible alternative entry point for grammar analysis.

**Acceptance:**
- [ ] A long press selects the entire sentence.
- [ ] The Russian grammar explanation matches the level.
- [ ] A long press does not add a word to the vocabulary.
- [ ] Scrolling does not trigger analysis.
- [ ] Caching prevents unnecessary repeat requests.
- [ ] An alternative method is accessible.
- [ ] Gestures are tested on a real smartphone.

**Outcome:** interactive grammar explanations.

## Stage 6. Reading sessions and adaptive repetition

**Goal:** a complete learning cycle.

**Work:**
- StartReading, ResumeReading, and CompleteReading.
- Autosave marked words and reading position; recover interrupted sessions.
- An explicit **Complete reading** button (the English translation of its Russian UI label).
- Supply active unknown words to the next generation request.
- Verify their actual presence in the generated text.
- At completion: words marked again remain Unknown; previous Unknown words that occurred without a mark become Learned; absent words do not change.
- New words do not count as Learned in the same session.
- WordExposure and WordInteraction preserve the evidence for status changes.
- Atomic and idempotent completion.

**Acceptance:**
- [ ] An interrupted session is restored with its marks.
- [ ] Completion records learning results exactly once.
- [ ] Only words that actually occurred are counted.
- [ ] Words marked again remain Unknown.
- [ ] Previous Unknown words that occurred without a tap become Learned.
- [ ] New words do not become Learned in the same session.
- [ ] The next generation request receives active vocabulary.
- [ ] History explains each status change.
- [ ] Unit tests cover transitions.

**Outcome:** a working adaptive reading algorithm.

## Stage 7. History and export/import

**Goal:** an application suitable for daily use.

**Work:**
- Text list: title, date, CEFR level, duration, and status.
- View completed texts and resume unfinished ones.
- View completed texts without changing progress.
- Versioned JSON export: texts, sessions, vocabulary, interactions, exposures, and saved explanations.
- Exclude the API key from exports.
- Import: validate the schema, version, and references; restore safely.
- The MVP may replace all local data after confirmation.

**Acceptance:**
- [ ] History shows texts and statuses.
- [ ] Unfinished reading can be resumed.
- [ ] Viewing completed texts does not change progress.
- [ ] Export produces valid JSON without the key.
- [ ] Import restores learning data.
- [ ] Invalid files do not damage the existing database.
- [ ] Tests cover export/import.

**Outcome:** history and backups.

## Stage 8. MVP stabilization

**Goal:** readiness for daily use on a phone.

**Work:**
- Check text readability, scaling, cards, and one-handed operation.
- Test tap/long press and scrolling in Android Chrome.
- Test loading, network errors, and loss of connectivity.
- Test recovery after browser closure or unload.
- Check performance with a large history.
- Eliminate duplicate AI requests.
- Check export/import and application updates.
- Update documentation and GitHub Pages.

**Acceptance:**
- [ ] TypeScript, lint, unit, and integration tests pass.
- [ ] Key E2E scenarios pass.
- [ ] Gestures are tested on a real phone.
- [ ] Session recovery and backups work.
- [ ] Updates do not lose user data.
- [ ] Code and artifacts contain no secrets.
- [ ] Documentation matches the implementation.
- [ ] GitHub Pages is deployed and working.

**Outcome:** a stable MVP.

---

## Definition of Done

A stage is complete only when:

1. The agreed stage requirements are implemented.
2. Code builds and applicable tests pass.
3. No known critical errors remain.
4. Data changes include migrations.
5. Logic changes include tests.
6. Relevant documentation is updated.
7. Existing functionality continues to work.
8. Codex reports verification results and limitations.

If checks have not been performed, describe the stage as incomplete and explain what remains.

## Procedure for adding future features

For each new feature, identify the user workflow, affected modules, Domain/data model changes, migrations, AI/prompt contracts, compatibility risks, automated tests, and acceptance criteria. Implement the smallest sufficient solution; do not build universal mechanisms without a concrete need.

## Initial instruction for Codex

Read `docs/requirements.md` and this plan. Start **only with stage 0**. Verify the static GitHub Pages application and direct OpenAI API requests from a phone browser. Do not implement later stages. After stage 0, report the acceptance criteria and stop until the user confirms acceptance.
