# Stage 0 — report

Date: 2026-10-12. Scope: technical feasibility only. Stages 1–8 had not been performed at the time of this report.

Status: the user accepted stage 0 with the statement, translated from Russian: "It works. Implement the next stage." Implementation, automated checks, and deployment are ready; the Pages conflict was resolved by switching to GitHub Actions. The automated verification results and their limitations are preserved below.

## Implemented

- A minimal React + TypeScript strict application, with a Vite production build using base `/vibe/`.
- A screen for entering, saving, replacing, and deleting the API key; a configurable model. localStorage is used only for the key and model; IndexedDB was not added.
- An explicit test request through an application use case and a separate `fetch` adapter for the Responses API. No backend, SDK, background requests, or automatic retries.
- Loading indicator, duplicate prevention, cancellation, and a 20-second timeout. Understandable errors for keys, permissions, limits, models, network/CORS, and incomplete/invalid responses.
- A separate English connection-check prompt, version 1. Learning prompts and features were not added.
- GitHub Actions: lockfile-based installation → types → unit tests → production build → browser mock checks → Pages artifact and deployment.
- README, AGENTS, and this report. The original requirements and implementation plan were unchanged during stage 0.

## Verification performed

| Check                                   | Result                                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`                     | Passed, TypeScript strict                                                                                                                                                                  |
| `npm ci`                                | Reinstallation from the lockfile verified successfully                                                                                                                                     |
| `npm test`                              | 18/18, mock transport/provider, no valid key used                                                                                                                                          |
| `npm run build`                         | Passed; JS approximately 227 kB / 71.5 kB gzip, CSS approximately 1.27 kB                                                                                                                  |
| `npm run test:browser`                  | 6 check groups passed on production preview in Chromium with a 390×844 mobile viewport                                                                                                     |
| Refresh and local settings              | Key/model restored; deleted keys do not reappear; no automatic requests                                                                                                                    |
| Mock AI and errors                      | Success, loading, duplicate prevention, HTTP 401 without leaking error text, network failures, and a successful retry                                                                      |
| Unit error handling and request control | 400/401/403/404/429/500, response validation, cancellation, timeout, duplicates, and redaction                                                                                             |
| Production base URL                     | All asset paths start with `/vibe/assets/`; loading and refresh verified in the browser                                                                                                    |
| Secret patterns                         | No OpenAI key detected in 15 source, test, dependency, and dist files; no valid key used                                                                                                   |
| Real CORS preflight                     | HTTP 200 for origin `https://serssp.github.io`; POST and `authorization,content-type` allowed; allow-origin `*`                                                                            |
| `npm run check:cors`                    | Real Chromium on GitHub Pages read HTTP 401 from a POST with a deliberately invalid test key; the API was not mocked                                                                       |
| GitHub Actions                          | [Run 38294895692](https://github.com/serssp/vibe/actions/runs/38294895692): build and deploy passed, including types, unit tests, build, Chromium, and Pages artifact                      |
| Repeat deployment                       | [Run 38296039260](https://github.com/serssp/vibe/actions/runs/38296039260): build and deploy passed after switching Pages to Actions                                                       |
| Deployed application check              | Production assets, mobile viewport, refresh, key persistence/deletion, real HTTP 401, and an understandable invalid-key error verified in Chromium without API mocks; no asset/page errors |

Browser checks identified a native `fetch` receiver problem: the adapter now binds it to globalThis. Final mock checks passed after this fix.

[Browser-side SDK support](https://developers.openai.com/api/reference/typescript) was investigated. Standard `fetch` was selected for the minimal request; the API and response shape follow the Responses API. The real CORS checks above verify that an HTTP error can be read from the current origin, but do not verify a model response with a valid key.

## Acceptance criteria

| Plan criterion                               | Status                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| GitHub Pages opens in Android Chrome         | Not checked by the agent: no access to a real phone                                                                            |
| Application loads after refresh              | Verified in local and deployed production Chromium                                                                             |
| OpenAI responds to a test request            | Not verified with a valid key; CORS and a real 401 rejection were checked                                                      |
| An invalid key shows an understandable error | Verified with mock UI checks and a real request from the deployed application in Chromium                                      |
| Key absent from Git/build artifacts          | Source and dist scan passed; no real key was used                                                                              |
| CI builds and deploys                        | Verified: after switching Source to Actions, the new workflow built and deployed the site without legacy publication from main |

## Remaining verification

Code was pushed to main in commit `03caf6e`. The legacy workflow [38294894351](https://github.com/serssp/vibe/actions/runs/38294894351) finished after the new workflow and overwrote the deployed artifacts with source files. The user confirmed switching https://github.com/serssp/vibe/settings/pages → Build and deployment → Source to **GitHub Actions**. Report commit `517598a` triggered a repeat deployment; run `38296039260` completed successfully. The deployed UI was verified with a real browser request using a deliberately invalid key. No backend or source-file publishing workaround was introduced.

After resolving the conflict, open https://serssp.github.io/vibe/ in Android Chrome, refresh the page, enter a valid key directly in the application, and run the test. Then check an invalid key, loss of connectivity, key replacement, and key deletion. Do not send the key in chat or include it in a report.

The user confirmed that the application works and authorized stage 1 only. The agent did not independently verify a valid key or real Android Chrome; acceptance of these user scenarios relies on the user's confirmation.
