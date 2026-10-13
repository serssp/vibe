# Stage 3 — German text generation

Date: 2026-10-13. Authorization: the user accepted stage 2 and requested the next three stages together. This report covers generation; [stage 4](stage-4-report.md) and [stage 5](stage-5-report.md) cover the subsequent authorized work.

Status: implementation and automated local verification complete. Real OpenAI content quality and a real phone have not been verified. Changes remain local and have not been committed or deployed.

## Changes and modules

- Added GenerateText actions, the LearningAIProvider contract, and an injected Runtime for UUIDs/UTC times. UI collects A1/A2/B1 and 3/4/5 minutes through GenerationPanel; App composes the workflows.
- Added English text-generation prompt v1 and Prompt Registry. Structured Responses JSON Schema and runtime validation reject invalid, incomplete and refused responses. Generated content is rendered as plain React text.
- The model returns ordered complete sentences; the application assigns stable IDs and saves TextDocument, the initial InProgress session and preferences together. Existing typography preferences are preserved. The initial session supplies the relationships needed by stage 4, without implementing stage 6's completion or adaptive algorithm.
- The latest saved text/session and level/duration are restored without an AI request. Recent titles provide topic-diversity context. Vocabulary review lists remain empty until stage 6.
- Settings, generation, lookup and grammar share one provider/transport. Loading, safe errors, cancellation, token totals and duplicate prevention are supported; retries require an explicit action. The existing key/model localStorage names are preserved.

## Validation

The final shared stages 3–5 batch passed:

| Check                        | Result                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`              | Both strict typechecks, lint without warnings, formatting, architecture, 127/127 tests across 9 suites, and production build passed |
| Architecture                 | No violations: 47 modules, 125 dependencies; Domain also compiled without DOM/Node.js ambient types                                 |
| `npm run test:browser`       | All 18 groups passed: 6 connection/settings, 4 native IndexedDB, 8 production learning/gesture groups in Chromium 390×844           |
| Secret/build scan            | No OpenAI key patterns found in src/tests/dist/.github/docs; dummy credentials and test artifacts absent from dist                  |
| Real OpenAI / Android Chrome | Not performed; automated API responses are mocked and Chromium touch input is synthetic                                             |
| GitHub Actions / deployment  | Not run for this local batch; the existing workflow invokes the expanded checks                                                     |

Architecture subprocess tests required execution outside the sandbox, which blocks child Node.js processes; the browser tests also require local preview servers. The checks passed with the applicable permissions. Generation tests cover atomic persistence and restore, stable sentence IDs, failure without losing the prior text, cancellation, concurrent-action prevention, recent topics and preference preservation. Structured transport tests validate strict payloads, unsupported shapes, refusals and key exclusion.

Production browser tests exercise generation options, loading, disabled duplicate actions, cancellation, invalid responses, reload without AI, escaped markup and a synthetic capacity failure that preserves the prior text. All AI results are mocked.

## Acceptance evidence and limits

| Criterion                                   | Evidence                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Select level and duration                   | Implemented and checked in mobile production Chromium                                                                 |
| Generate and display German on a smartphone | Mock German output verified at 390×844; real OpenAI generation and real Android device remain unverified              |
| Save/open after refresh                     | Production reload preserves exact sentence IDs and contents without a new request                                     |
| Invalid responses and errors handled        | Provider, integration and browser checks cover response, cancellation and write failures without replacing prior data |
| No parallel generations                     | Application and UI reject concurrent actions; provider permits one active request                                     |
| No requests from re-render                  | Initial load/refresh issue no AI calls; explicit buttons/gestures own network actions                                 |

Approximate reading length uses 70/90/110 words per minute for A1/A2/B1 as a prompt target, not a measured personal reading speed. Real coherence, CEFR accuracy and topic diversity require manual assessment. Previous documents remain stored; history UI is stage 7. Position autosave, adaptive review and completion are stage 6. GitHub Actions/deployment for this batch has not run.

Manual acceptance steps are in [testing.md](testing.md). The user's explicit batch authorization permitted continuing through stages 4–5 without an intermediate approval. Stage 6 has not started.
