# Stage 5 — Grammar analysis

Date: 2026-10-13. Scope: the third stage of the user's explicitly authorized stages 3–5 batch.

Status: implementation and automated local verification complete. Acceptance is incomplete because the plan requires gesture verification on a real smartphone. Code commit `71e307c` was published through GitHub Actions after the user authorized publication.

## Changes and modules

- Added ExplainGrammar actions and GrammarCard. Holding a word for approximately 500 ms highlights its whole sentence and opens a Russian explanation, relevant German fragments and examples/translations. A dedicated sentence button and keyboard actions provide the accessible alternative.
- Added English grammar-explanation prompt v1, strict JSON Schema and runtime validation. Fragments must occur in the selected sentence. The saved text's CEFR level controls the explanation request.
- Reused GrammarExplanation persistence with a cache key containing text, sentence, CEFR, model and prompt version. Cached analysis works without network; concurrent equivalent saves reuse the committed result.
- Grammar calls never enter vocabulary operations. Network/validation/cancellation failures do not change word state or interaction history. UI shows progress, token totals where available, safe errors and an explicit retry.
- Added mutually exclusive reader gesture recognition: an 8 px movement threshold, pointer/scroll/secondary-touch/focus cancellation, local context-menu suppression and native scrolling. A compatibility click from a consumed or cancelled gesture is suppressed before it can retarget a sentence button or a newly opened card. Intentional subsequent pointer actions and keyboard buttons remain available.
- Cards receive focus for keyboard access and restore the initiating focus when closed. German text and Russian analysis are rendered through React rather than trusted HTML.

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

Architecture subprocess tests required execution outside the sandbox, which blocks child Node.js processes; the browser tests also require local preview servers. The checks passed with the applicable permissions. Integration tests verify cache separation by sentence/CEFR/model/prompt, fragment validation, network error isolation and no vocabulary/history mutations.

Production mobile Chromium tests exercise native short taps and 600 ms holds, whole-sentence selection, accessible keyboard entry, cache after reload, movement, scrolling, pointer cancellation, suppression of synthetic clicks, blocked context menus, enlarged font layout, offline cache, network failure and explicit retry. Browser screenshots are inspected with synthetic data only.

The published site [serssp.github.io/vibe](https://serssp.github.io/vibe/) was checked separately in Chromium 390×844 with mocked OpenAI responses: all eight production learning groups passed, including generation/options/refresh, word cards/repeated marks/undo, failed lookups after reload, noun/sense/separable-form fixtures, long press and keyboard grammar entry, movement/scroll/pointer cancellation, offline cache, network retry, and synthetic capacity failure. No browser page errors were detected. This is published browser verification, not a real model response or real Android verification.

## Acceptance evidence

| Criterion                            | Evidence                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Long press selects the sentence      | Native Chromium hold highlights the full sentence                                                            |
| Russian analysis matches CEFR        | Request carries the saved CEFR and UI displays Russian mock rules; real model correctness remains unverified |
| Hold does not add vocabulary         | Network and stored-interaction counters unchanged by grammar actions                                         |
| Scrolling does not trigger analysis  | Movement, native scroll and cancellation tests include compatibility-click suppression                       |
| Cache avoids repeated requests       | Explicit analysis after reload and offline analysis reuse the saved result                                   |
| Alternative is accessible            | Sentence button, keyboard activation and card focus behavior provided                                        |
| Gestures tested on a real smartphone | Not performed; this mandatory criterion remains open                                                         |

No real OpenAI requests or valid keys were used; GitHub Actions and deployment passed; see [Run 38355009069](https://github.com/serssp/vibe/actions/runs/38355009069): build checks and Pages deployment passed for code commit `71e307c`. Automated Chromium at 390×844 does not substitute for Android Chrome. Manual steps for real content quality and device gestures are in [testing.md](testing.md).

Stages 3–5 are implemented as the authorized batch. Real-device/manual acceptance remains outstanding; stage 6 has not started. Work stops after these reports.
