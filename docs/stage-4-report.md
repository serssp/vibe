# Stage 4 — Word translation and vocabulary

Date: 2026-10-13. Scope: the second stage of the user's explicitly authorized stages 3–5 batch.

Status: implementation and automated local verification complete. Real model interpretation and Android touch behavior remain unverified. Code commit `71e307c` was published through GitHub Actions after the user authorized publication.

## Changes and modules

- Added LookupWord actions, WordCard/WordSelection/WordLookup/WordTranslation models, Unicode tokenization, lemma normalization, and mark/undo rules. VocabularyCard displays lemma, contextual Russian meaning, part of speech, noun article/gender and form/expression details. VocabularyList displays persisted active marks with separate senses.
- Added English word-translation prompt v1, strict response schema and contextual runtime checks. Full sentence and exact token offsets allow inflections, separable verbs and multiword expressions. A matching existing sense requires an explicit candidate ID plus matching normalized lemma, part of speech and article. New/ambiguous senses receive separate identities.
- Persisted Pending lookup intents before AI. Failure or abort leaves a durable, visible mark for explicit retry/cancellation after refresh, with no invented translation or vocabulary entry.
- Added schema migration 2: wordLookups and wordTranslations stores/indexes, preserving schema v1's records. Successful cards are immutable and cached by exact text/sentence/token/model/prompt context. A cached tap still appends a new user interaction.
- Added atomic resolution and undo to LearningRepository. Resolution rereads current counters/cache inside the transaction, creates one MarkUnknown and updates Unknown state. Undo records an immutable UndoMarkUnknown and safely reverses just that mark. Repeated/out-of-order undo and competing connections are covered.
- Cards preserve the sentence in a panel on the current screen. Keyboard activation moves focus into the card and returns focus when closed. Contextual text is escaped by React; no API key enters intents/cards/learning data.

## Validation

The final shared stages 3–5 batch passed:

| Check                        | Result                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`              | Both strict typechecks, lint without warnings, formatting, architecture, 127/127 tests across 9 suites, and production build passed            |
| Architecture                 | No violations: 47 modules, 125 dependencies; Domain also compiled without DOM/Node.js ambient types                                            |
| `npm run test:browser`       | All 18 groups passed: 6 connection/settings, 4 native IndexedDB, 8 production learning/gesture groups in Chromium 390×844                      |
| Secret/build scan            | No OpenAI key patterns found in src/tests/dist/.github/docs; dummy credentials and test artifacts absent from dist                             |
| Real OpenAI / Android Chrome | Not performed; automated API responses are mocked and Chromium touch input is synthetic                                                        |
| GitHub Actions / deployment  | [Run 38355009069](https://github.com/serssp/vibe/actions/runs/38355009069): build checks and Pages deployment passed for code commit `71e307c` |

Architecture subprocess tests required execution outside the sandbox, which blocks child Node.js processes; the browser tests also require local preview servers. The checks passed with the applicable permissions. Integration tests cover ging/gehen association, unverified meanings remaining separate, repeated taps, contextual cache/model keys, failed intent after reopening, explicit retry, late/cancelled responses, out-of-order undo, restoration of previously Learned state and concurrent connections without counter loss.

Production browser tests use native Chromium touch events and mocked responses: card display, noun article/gender, distinct Bank senses, separated aufstehen components, vocabulary persistence, undo, failed lookup after reload, explicit retry and cached offline lookup. The shared gesture tests verify scroll/movement/cancellation without accidental marks.

The published site [serssp.github.io/vibe](https://serssp.github.io/vibe/) was checked separately in Chromium 390×844 with mocked OpenAI responses: all eight production learning groups passed, including generation/options/refresh, word cards/repeated marks/undo, failed lookups after reload, noun/sense/separable-form fixtures, long press and keyboard grammar entry, movement/scroll/pointer cancellation, offline cache, network retry, and synthetic capacity failure. No browser page errors were detected. This is published browser verification, not a real model response or real Android verification.

## Acceptance evidence and limits

| Criterion                                       | Evidence                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Tap opens contextual card                       | Native Chromium tap plus Russian mock-card rendering verified                                                 |
| Vocabulary persists                             | Repository reopen and production reload checks pass                                                           |
| Repeated taps are history events                | Each completed lookup records a mark even when cached; undo appends its own event                             |
| ging and gehen can share a lemma                | Explicit verified-candidate fixture associates ging/gehe with gehen; actual model accuracy remains unverified |
| Different meanings are not automatically merged | Unverified candidates remain separate; production fixture distinguishes Bank meanings                         |
| Cache avoids requests                           | Repeated same-context and offline cached taps verified; model/version/context separate keys                   |
| Scrolling avoids translations                   | Native movement/scroll/cancel checks produce neither network requests nor marks; real Android still required  |

Only 100 recent candidates are sent to AI to limit context cost. Older unmatched senses may remain separate; no spelling-based merge is performed. Cancelled initial marks leave inactive records with count 0 to preserve immutable relationships, and these are hidden from the personal list. Stage 6 must use effective history when selecting review vocabulary.

The reports distinguish mocked interpretation from real OpenAI quality. No valid key or real model request was used. GitHub Actions and deployment passed; see [Run 38355009069](https://github.com/serssp/vibe/actions/runs/38355009069): build checks and Pages deployment passed for code commit `71e307c`. The batch proceeds to stage 5 under the existing authorization; stage 6 remains outside scope.
