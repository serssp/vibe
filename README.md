# Vibe — German Learning App

A personal German reading app with contextual Russian vocabulary and grammar cards, adaptive repetition, reading history, and JSON backups. Stages 0–5 were implemented previously; the user authorized all remaining stages 6–8 together. Implementation and automated verification are complete; real Android and real model quality acceptance remain separate manual checks. Requirements: [docs/requirements.md](docs/requirements.md), execution order: [docs/implementation-plan.md](docs/implementation-plan.md), layer design: [docs/architecture.md](docs/architecture.md), schema: [docs/data-model.md](docs/data-model.md).

## Local startup

Use Node.js 22.13+ within the 22 release line, or 24/26+ (CI uses 22).

```sh
npm ci
npm run dev
```

Open the `/vibe/` URL displayed by Vite. Production verification:

```sh
npm run check
npx playwright install chromium
npm run test:browser
npm run preview
```

`test:browser` first checks production preview at `127.0.0.1:4173/vibe/`, then starts a Vite test server at `127.0.0.1:4174/vibe/` to exercise the IndexedDB adapter in native Chromium, then checks the production learning workflows and touch gestures on port 4173, followed by daily reading/history/backup scenarios on port 4175. Tests use a dummy key and mock or block the API; they do not call OpenAI. On Linux, Playwright may require system dependencies: `npx playwright install --with-deps chromium`. See [docs/testing.md](docs/testing.md) for verification boundaries.

`npm run check` runs strict typechecks for the application and pure Domain, ESLint, Prettier checks, architectural dependency analysis, unit tests, and a build. Use `npm run format` to format files and `npm run lint:fix` for automatically fixable lint errors. The original requirements and implementation plan are excluded from automatic formatting.

## OpenAI setup and test

The application uses Russian UI labels; their English translations are used below. Generation, word lookup, and grammar use the key and model from saved settings. The connection check can still use unsaved field values.

Open the application, enter your key in the API key field and a model name, press **Save settings**, then **Test connection**. The key and model can be replaced; **Delete key** removes the local key. The check uses the current field values. Saving restores settings after a page refresh.

The application uses `POST https://api.openai.com/v1/responses` through standard browser `fetch` in `src/infrastructure/ai/openai-connection.ts`. UI receives `SettingsActions`, and use cases call the `AIProvider` and `StorageRepository` interfaces. Concrete adapters are created only in `src/app/create-services.ts`. Generation, translation, grammar, and connection checks share one provider instance and one transport. No backend, proxy, or OpenAI SDK has been added. The [official SDK](https://developers.openai.com/api/reference/typescript) supports browser mode with `dangerouslyAllowBrowser: true`; standard `fetch` is sufficient for a single test request.

The initial model, `gpt-4.1-mini`, can be changed; availability depends on the account. Prompt [connection-check.md](src/prompts/connection-check.md), version 1: a connection check with no input parameters and the expected short response `Hallo!`. It is not a learning-text generation prompt. Responses are checked for completion and text content. Token usage is displayed when the API provides it.

The key is stored separately in localStorage (`vibe.openai-api-key`) on the user's device and sent in Authorization only to the fixed OpenAI endpoint. The browser can access the key; this is an agreed MVP limitation. Do not place it in files, `.env`, build-time GitHub Secrets, URLs, or logs. If localStorage is unavailable, connection checking remains possible without saving. Connection checks have a 20-second timeout; learning requests have a 60-second timeout. Requests support cancellation. There are no automatic retries or background AI requests.

HTTP 401 means an invalid key, 403 means access denied, 429 indicates a limit/balance issue, and 400/404 asks the user to check the model. Network failures display an internet/CORS message: the browser cannot reliably distinguish these causes. Browser-side SDK support alone does not prove CORS availability for a particular origin. `npm run check:cors` separately makes a real browser request with a deliberately invalid key from the deployed site's origin and expects a readable HTTP 401. It does not run in CI and does not verify a model response. Test with a valid key on the deployed site from a phone.

## GitHub Pages

Site: https://serssp.github.io/vibe/ . Vite always builds with base `/vibe/`; the application does not use nested routes and loads at this URL after a refresh.

In Settings → Pages → Build and deployment, select **GitHub Actions**. Workflow `.github/workflows/pages.yml` runs `npm ci`, typecheck, lint, format check, architecture check, unit tests, a production build, and browser mock checks, then deploys only `dist` through the official Pages artifact. Deployment runs on `main`; pull requests run checks only. The workflow does not receive an OpenAI key. If Pages settings block deployment, do not work around this by publishing source files or adding a backend.

## Stage 0 acceptance

Open the deployed site in real Android Chrome, refresh it, save your key, refresh again, and run the test. Expect **OpenAI responded** and `Hallo!`. Replace the key with a deliberately invalid value: expect an understandable error. Disable the network: expect a network error; restore connectivity and retry. Check key replacement and deletion after a refresh. Do not include the key in the report.

Automated Chromium with a mobile viewport does not replace Android Chrome. Mock success does not verify an OpenAI response. Historical results are in [docs/stage-0-report.md](docs/stage-0-report.md) and [docs/stage-1-report.md](docs/stage-1-report.md). Stage 2 results are in [docs/stage-2-report.md](docs/stage-2-report.md). Historical reports: [stage 3](docs/stage-3-report.md), [stage 4](docs/stage-4-report.md), [stage 5](docs/stage-5-report.md). Current reports: [stage 6](docs/stage-6-report.md), [stage 7](docs/stage-7-report.md), [stage 8](docs/stage-8-report.md).

## Reading and analysis

Save your key and model in settings. Choose A1/A2/B1 and 3/4/5 minutes, then press **Generate text**. The text, stable sentence IDs, initial reading session, and level/duration preferences are saved together. Refresh restores the selected reading and saved sentence-relative position without an AI request. Scroll position is saved after a 300 ms pause, and pending saves are flushed on visibility change, pagehide, and reader navigation. An abrupt operating-system kill can still lose movement since the last committed save.

A short tap on a word opens its contextual Russian card with the dictionary lemma, part of speech, noun article/gender, and form or expression explanation. Each successful tap records a separate mark, including cached lookups. **Undo mark** reverses that mark without deleting history. A failed lookup remains in **Unfinished marks** after refresh; retry it explicitly or cancel the mark.

Hold a word for approximately 500 ms to highlight the sentence and open a Russian grammar explanation. **Analyze sentence** is the keyboard-accessible alternative. A grammar action never marks vocabulary. Moving the finger, scrolling, pointer cancellation, and secondary touches cancel gesture recognition; resulting synthetic clicks are suppressed. Reading and cards support system font scaling.

Successful cards and explanations are cached in IndexedDB with their context, model, and prompt version. Cached actions work without network while the application is open. A changed model or prompt creates a separate cache entry. The three English [prompts](src/prompts) document their inputs, output schema, purpose, and version. Learning responses use strict JSON Schema and runtime validation, following the [official OpenAI documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). Content is rendered as plain React text.

## Completion, history and backups

Press **Complete reading** below the text. Completion saves the session, confirmed word exposures, and vocabulary changes atomically. Repeated completion does not award progress again. Resolve or cancel unfinished marks first. A previous unknown word becomes Learned only if it was confirmed in the text and has no effective mark in this session; new and absent words retain their state. Undo history is respected. A later explicit tap can mark a Learned word Unknown again.

Generation supplies up to 30 active Unknown words, prioritizing older marks. The version 2 generation prompt asks for exact contextual occurrence evidence. The application verifies the actual sentence, literal word boundaries, canonical lemma and certainty of the supplied meaning; duplicate senses are excluded. Inflections and separated verb components are deliberately skipped for automatic progress unless the canonical expression itself appears. They still work in vocabulary cards. This policy favors missing a repetition over awarding uncertain progress.

**Text history** lists title, date, level, duration, status and session count, showing 20 records at a time without deleting older data. Open unfinished readings to resume. Completed texts are read-only for word marks; grammar buttons remain available. **Start a new reading** creates a separate session explicitly. Merely viewing a completed text preserves learning facts. The personal vocabulary also pages entries and provides local per-word mark/undo/repetition history.

**Backup** exports version 1 JSON containing all learning stores, preferences, pending lookups, and contextual caches. The API key is excluded. Choose a JSON file to validate and preview its record counts, then explicitly confirm replacement or cancel. Invalid shapes, versions, duplicate identities and references are rejected. Clearing and restoring every learning store happen within one transaction; a failed restore rolls back the entire replacement. Connection key/model settings in localStorage are preserved.

Database `vibe.learning` uses schema version 3. Migrations 1 and 2 preserve their original stores. Migration 3 adds vocabulary-history indexes and a nullable selected-session reference to existing preferences. Upgrade and rollback tests cover v1/v2 data. See [data-model.md](docs/data-model.md), [architecture.md](docs/architecture.md), and [testing.md](docs/testing.md).

Deployment and published mock verification are recorded in [stage 8](docs/stage-8-report.md). Real OpenAI quality and Android touch behavior must be checked on the user's phone; automated Chromium does not establish those acceptance criteria.
