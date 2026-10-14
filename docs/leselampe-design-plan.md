# Leselampe-Inspired Design and UX Plan

**Date:** 2026-10-13
**Status:** D1–D5 implemented; D6 local, CI and published mock verification passed. Real Android acceptance remains outstanding. Implementation was authorized by the user on 2026-10-13.
**Scope:** Bring Vibe's existing mobile reading experience and visual design closer to [Leselampe](https://github.com/clbagrat/leselampe).
**Related documents:** [Requirements](requirements.md), [Architecture](architecture.md), [Testing](testing.md).

This plan covers a new design update after the MVP accepted by the user. It does not replace the MVP requirements or imply that the agent performed real-device or real-model verification. The plan and project documentation are in English; the application UI and learning explanations remain in Russian.

## 1. Target experience

The main journey is: open the text library, continue or create a story, read with minimal distractions, tap a word or hold a sentence for help, and explicitly complete the reading.

Adopt Leselampe's warm paper background, editorial typography, compact header, rounded floating learning cards, clear selection feedback, and separate screens. Keep Vibe's identity, existing architecture, and learning semantics.

Use labelled navigation rather than copying Leselampe's small page dots. Do not require horizontal swipes to discover sections. Keep native vertical scrolling, browser zoom, and system font scaling.

## 2. Scope boundaries

### Included

- Separate Library, Reader, Vocabulary, and Settings screens.
- Leselampe-inspired colours, typography, spacing, surfaces, and controls.
- Presentation improvements to generation, word cards, grammar cards, history, settings, and backups.
- Small improvements: selected-word highlighting, compact/expanded cards, reader appearance controls, local search/filtering, contextual feedback, and clearer empty/error/loading states.
- Existing A1/A2/B1 and 3/4/5-minute generation options.
- Existing short-tap and approximately 500 ms long-press interactions.

### Excluded

Do not implement audio or text-to-speech, shadowing, RSS, OCR/scanning, pasted-text import, chat with a teacher, exercises, quizzes, comprehension checks, accounts, synchronization, or a backend.

Do not add topic prompts, suggested topics, new CEFR levels, generation styles, or additional AI response fields. Do not add grammatical dependency highlighting, compound-word analysis, or new morphology features.

Do not change automatic unknown-word marking into an explicit add/ignore workflow. Do not add read/unread toggles that bypass reading-session rules. Do not introduce deletion of saved texts or vocabulary in this design update.

## 3. Existing behaviour to preserve

- A successful word lookup records a mark, including cached lookups; undo reverses that mark.
- Grammar analysis does not mark vocabulary.
- Failed lookups retain their existing recovery and cancellation semantics.
- Completion remains explicit, atomic, and idempotent.
- Viewing a completed text does not change learning progress; a new reading requires an explicit action.
- Existing contextual caches, model/prompt identity, repetition rules, backups, and validation remain intact.
- Screen changes and appearance changes do not issue AI requests.
- Navigation must not lose saved reading position or pending actions.
- Keep API keys, localStorage keys, model settings, and existing learning records compatible.

## 4. Implementation sequence

### D1. Visual foundation

**Goal:** establish a consistent visual language before restructuring screens.

**Work**

- Define CSS tokens for paper, ink, coral accent, muted text, surfaces, borders, radius, spacing, and typography.
- Use a warm paper reading surface, dark text, restrained coral selection/action accents, and subtle shadows on floating cards.
- Use an editorial serif for German story text and headings, with a readable sans-serif for controls and Russian explanations. Start with system font stacks; avoid a new third-party font dependency.
- Define shared primary/secondary/icon buttons, badges, text inputs, and selection states.
- Maintain comfortable touch targets, visible focus, sufficient contrast, reduced-motion support, and safe-area spacing.

**Acceptance**

- Existing screens use consistent tokens and controls.
- Layout works at 320, 360, 390, and 430 CSS pixels without horizontal overflow.
- Large text and 200% zoom remain usable; no controls are clipped.

**Likely modules:** `src/style.css`, existing presentation components.

### D2. Application shell, library, and generation

**Goal:** replace the long combined page with task-focused screens.

**Work**

- Add Library, Vocabulary, and Settings destinations with icons and Russian labels.
- Open the Reader from a library item, with a clear Back action and compact header.
- Use navigation compatible with the GitHub Pages `/vibe/` base, such as hash-based navigation; avoid server-dependent nested routes.
- Handle browser/Android Back: close a transient panel first, then return from Reader to Library. Keep navigation and restored session state consistent.
- Replace the collapsed history section with story cards: title, short excerpt, date, level, duration, and existing session status.
- Put a prominent Continue action for the most recently selected unfinished reading above the library. Keep completed texts available.
- Present generation in a dedicated dialog or sheet opened by New text. Replace level/duration selects with accessible segmented choices.
- Preserve chosen generation settings, cancellation, loading/error handling, and save-before-open behaviour.
- Move backups and connection testing to Settings. With no saved key, offer a clear setup action before generation; locally saved reading remains available.

**Acceptance**

- All existing features remain reachable through the new navigation.
- Generate, save, open, resume, view completed, and start a new reading work as before.
- Refresh and Back work on GitHub Pages; library scroll position is preserved when returning.
- A failed or cancelled generation does not discard an existing reading.

**Likely modules:** `src/app/App.tsx`, `GenerationPanel.tsx`, `HistoryList.tsx`, Settings and Backup components.

### D3. Focused reader

**Goal:** make the story occupy most of the screen.

**Work**

- Remove the marketing header and generation form from the reading screen.
- Use a paper surface with comfortable horizontal margins instead of a nested bordered content card.
- Remove repeated visible Analyse sentence buttons after every sentence.
- Provide an accessible replacement: focusing/selecting a sentence reveals its analysis action, including a keyboard-accessible sentence selector/action. Retain long press as the primary touch interaction.
- Show a brief gesture hint on first use and make help available again from the reader.
- Highlight the selected word and its sentence; use a distinct sentence-only state for grammar analysis.
- Add a thin reading-position indicator. Scrolling to the end must not automatically complete the session.
- Add an Aa panel for font family, size, line spacing, and sentence-per-line display.
- Render continuous sentences using stable sentence IDs. Preserve paragraph boundaries only where existing content provides reliable boundaries; do not invent paragraph structure or change the generation schema.
- Store appearance preferences as small local settings through the existing architectural boundaries, with safe defaults. They must not alter learning records.
- Preserve sentence-relative position when navigating, reopening, or changing typography.

**Acceptance**

- Reading has no repeated large controls between sentences.
- Tap and long press remain mutually exclusive; scrolling and secondary touches cancel gestures.
- Grammar remains accessible without long press.
- Appearance changes preserve text, sentence identity, and learning state.
- Position indication is clearly separate from confirmed completion.

**Likely modules:** `Reader.tsx`, reader gesture/position hooks, presentation styles, settings adapter/use cases where needed.

### D4. Learning cards and request feedback

**Goal:** answer the immediate question quickly while retaining reading context.

**Work**

- Turn the existing fixed analysis panel into a shared bottom sheet with compact and expanded states.
- Word card order: tapped form, lemma/article, contextual Russian meaning, short form explanation; place the full sentence and secondary details under More.
- Keep grammar rules and examples readable in the expanded sheet.
- Add a visible close control and downward dismissal from the handle. Buttons remain the accessible alternative to gestures.
- Allow closing during loading. Abort or detach the request safely; prevent a late response from reopening the sheet or replacing a later selection.
- Preserve pending-lookup recovery and mark/undo semantics when a request is cancelled.
- Use the actual sheet height to keep the selected fragment above the panel and add sufficient bottom scroll space. Avoid unnecessary scroll jumps.
- Display loading and retry/cancel actions inside the sheet.
- Explain automatic marking with concise Russian copy equivalent to Marked as unfamiliar / Undo. Closing is not undo.
- Move token counts and cache diagnostics into a secondary details area.

**Acceptance**

- The selected fragment stays visible above both compact and expanded cards.
- Long content scrolls inside the sheet without trapping normal reading.
- Close, cancellation, retry, undo, and rapid close/reopen do not produce stale UI or duplicate marks.
- Cached and failed requests retain their existing behaviour.
- Card expansion, dismissal, and animations support keyboard and reduced-motion preferences.

**Likely modules:** `VocabularyCard.tsx`, `GrammarCard.tsx`, shared sheet, `App.tsx`, reader visibility logic.

### D5. Vocabulary, settings, and small usability improvements

**Goal:** make supporting screens as clear as the reader.

**Work**

- Replace vocabulary disclosure lists with consistent rows showing lemma/article, meaning, and status.
- Add local search and Studying/Learned filters using stored status; keep distinct meanings separate.
- Open existing word history as secondary details rather than displaying technical counts prominently.
- Add local title search and status filters to the library. Preserve access to all records and existing pagination.
- Group Settings into Connection, Reading appearance, and Backup.
- Remove repeated branding and connection-test instructions from the main reading journey.
- Standardize empty, loading, success, and error states across screens.
- Retain backup validation preview, explicit replacement confirmation, key exclusion, and transaction rollback behaviour.

**Acceptance**

- Search/filter operations are local and issue no AI requests.
- Empty filters have a clear reset action.
- Vocabulary counts match the selected status/filter and include learned records correctly.
- Existing connection and backup workflows remain functional.

**Likely modules:** `VocabularyList.tsx`, `HistoryList.tsx`, `SettingsPage.tsx`, `BackupPanel.tsx`.

### D6. Regression verification and visual acceptance

**Goal:** verify the complete design update.

**Work**

- Run `npm run check` and `npm run test:browser`.
- Adapt existing browser scenarios to the new screens; add focused checks for navigation, stale request results, accessible grammar access, sheet overlap, and appearance/position restoration.
- Use a mock provider and realistic short/long text, empty/populated library, learned/unknown vocabulary, cached results, and failed/pending lookup fixtures.
- Capture mobile screenshots for Library, Reader, word sheet, grammar sheet, Vocabulary, Settings, and generation states.
- Compare composition with Leselampe: typography, density, paper surface, header size, card hierarchy, and selected-text visibility.
- Verify on real Android Chrome: Back, scrolling, taps, long press, dismissal, keyboard, browser toolbar resizing, font scaling, refresh, and recovery.
- Check deployment through the existing GitHub Actions workflow; record its actual result separately from local checks.
- Update the architecture and testing documentation.

**Acceptance**

- Required automated checks pass and existing learning/storage regressions are absent.
- Screenshots demonstrate the intended design at phone sizes.
- Real-device and deployed verification are reported honestly; unperformed checks remain outstanding.
- No excluded feature or unintended AI/data-contract change has been introduced.

## 5. Delivery rules

Implement D1 through D6 in order, only within the subsequently authorized scope and the repository's execution rules. The original planning commit did not authorize implementation; the subsequent user instruction “Исполняй” authorized D1–D6.

For each implemented stage, provide a concise report with changed components, screenshots where relevant, checks and results, remaining limitations, and the next dependency. Keep documentation in English and UI labels in Russian.

Prefer presentation changes and small local UI preferences. No learning-database migration is expected. If implementation discovers a required learning-schema or AI-contract change, keep it outside this design scope until explicitly agreed.

## 6. Completion criteria

Vibe is ready for design acceptance when the library-first journey, focused reader, contextual bottom sheets, vocabulary screen, and settings screen feel consistent with Leselampe's reading-oriented design, while all existing Vibe learning behaviour remains intact.

The deliverable is a cohesive redesign of existing functionality, with the small usability improvements specified above.

## 7. Implementation report — 2026-10-13

The authorized update implements the library-first workflow and existing learning actions. No learning migration, AI contract/prompt change, backend, additional generation option or excluded feature was introduced.

| Stage | Delivered components and behavior                                                                                                                                                                                     | Evidence and dependency                                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| D1    | Paper/ink/coral tokens, system serif and sans stacks, shared controls, focus, touch targets, reduced motion and safe areas in `src/style.css`.                                                                        | Mobile composition and overflow/text-scaling checks; foundation used by D2.                                                         |
| D2    | Hash shell, separate destinations, persistent library UI state, Continue, story cards and a generation modal with native radio choices. Connection and backups are in Settings.                                       | Existing generation/restore/failure/cancellation workflows adapted to navigation; D3 uses the focused Reader destination.           |
| D3    | Continuous sentences with stable IDs, reliable stored paragraph boundaries, selected tokens/sentences, one accessible sentence selector, help, sticky reader controls, position indicator and appearance preferences. | Stable-ID and sentence-position checks across navigation/refresh/typography; no learning-schema changes. D4 adds contextual sheets. |
| D4    | Shared compact/expanded sheet, contextual word hierarchy, expanded grammar, close/handle/Escape controls, actual-height spacing, request abort/epoch isolation and secondary diagnostics.                             | Mock delayed-response, pending-recovery, cache, undo and overlap checks; D5 reuses the visual foundation.                           |
| D5    | Local title/status filters and vocabulary search/status rows, secondary word history, Connection/Appearance/Backup settings groups and consistent empty/error/loading states.                                         | Local-only filtering, Learned visibility, existing backup validation/confirmation/rollback and pagination scenarios.                |
| D6    | Required checks, adapted regression scripts, focused design browser suite, mobile captures and architecture/testing documentation.                                                                                    | Local/CI/published results and remaining device limits are recorded below.                                                          |

### Verification and limitations

Automated checks use dummy credentials and mocked AI transport. Real OpenAI requests and real Android Chrome checks were not performed. Device acceptance remains outstanding for native browser Back, touch/keyboard behavior, toolbar resizing, zoom and font scaling. System font stacks intentionally use installed fonts; composition can vary by platform.

The visual reference was inspected in [Leselampe's stylesheet](https://github.com/clbagrat/leselampe/blob/main/styles.css). The update follows its paper/ink palette, serif reading surface, compact toolbar and rounded floating cards, with a darker coral action colour for readable contrast and labelled navigation.

Local verification: `npm run check` passed with 160 tests, strict application/Domain typechecks, lint, formatting, architecture checks and production build. `npm run test:browser` passed all five scripts, including mock AI, native IndexedDB, existing learning/backup regressions and the design suite. The design suite checks all four phone widths and 200% root text, selected-word overlap, panel navigation, delayed-response isolation, appearance/position restoration and direct links to a different saved text. Deployment verification is recorded below.

### Mobile captures

These 390×844 Chromium captures contain synthetic records and mocked responses:

- D1/D3: [Reader](screenshots/leselampe/reader.png).
- D2: [Empty library](screenshots/leselampe/library-empty.png), [Library](screenshots/leselampe/library.png), [Generation](screenshots/leselampe/generation.png), [Loading](screenshots/leselampe/generation-loading.png), [Error](screenshots/leselampe/generation-error.png).
- D4: [Compact word](screenshots/leselampe/word-compact.png), [Expanded word](screenshots/leselampe/word-expanded.png), [Loading word](screenshots/leselampe/word-loading.png), [Expanded grammar](screenshots/leselampe/grammar-expanded.png).
- D5: [Vocabulary](screenshots/leselampe/vocabulary.png), [Settings](screenshots/leselampe/settings-appearance.png).

Further acceptance depends on real Android Chrome checks; no further implementation stage or learning-schema change is required by this update.

Remote runs [38366408275](https://github.com/serssp/vibe/actions/runs/38366408275) and [38366961030](https://github.com/serssp/vibe/actions/runs/38366961030) passed the existing workflows and design request/position checks, then exposed mobile layout expansion at 320 pixels with 200% text on the CI platform. The second diagnostic reported a 349-pixel fixed navigation. Explicit navigation-label spans, wrapping button text and bounded mobile text adjustment prevent content from expanding the viewport. Design checks now compare document overflow to the root client width, wait for resize painting and report geometry; one CSS pixel of renderer rounding is allowed only for the fixed-navigation rectangle. The final deployment result is recorded below.

### Published verification — 2026-10-13

Implementation commit `1016a47` passed [GitHub Actions run 38381140392](https://github.com/serssp/vibe/actions/runs/38381140392): build checks, 160 tests, all five browser scripts and GitHub Pages deployment succeeded. The published [Vibe site](https://serssp.github.io/vibe/) serves the same JavaScript and CSS asset hashes as the locally checked production build.

Both `tests/daily-browser-check.mjs` and `tests/design-browser-check.mjs` passed against `https://serssp.github.io/vibe/` in isolated Chromium contexts with mocked API responses. The published daily check covered learning/completion/rereading, pending recovery, backup download/validation/restore and 502-record pagination. The design check covered transient Back/Escape/dismissal, selected-word geometry, stale results, appearance/position recovery, local filters, all phone widths with 200% root text, and deep links to a different saved text.

These are automated checks of the deployed application. No real OpenAI request or real Android Chrome verification was performed. The remaining acceptance dependency is the manual device check listed in D6.

### Word card refinement — 2026-10-14

The user authorized a further presentation adjustment after comparing the word dialog with Leselampe. Tapping a word now shows the lemma/article and meaning without repeating identical forms, with part of speech and noun gender beside the heading. A distinct inflected form remains visible. More reveals the full sentence, a distinct expression and the form explanation. Compact spacing and a shared mark/undo row replace the lower duplicate close button; the sheet retains its close, expansion, keyboard and downward-dismissal controls.

Affected modules are VocabularyCard, FloatingSheet, App and word-specific CSS. This update has no data changes, migrations or AI-contract changes; automatic marking, cache reuse, recovery and undo keep their existing behavior. Existing learning and design browser checks cover inflected forms, noun metadata, separable expressions, cancellation and selected-word visibility. The compact mock fixture must occupy less than 35% of a 390×844 viewport and all phone widths retain 200% text support. The compact, expanded and loading word captures above have been refreshed. Verification for this refinement is local with mocked API responses; deployed CI, real OpenAI and Android Chrome have not been checked for this change.

Local verification passed: `npm run check` (160 tests and production build), `npm run test:browser` (all five scripts), and lint/format checks after the final test adjustments. Word-result assertions wait for grammatical metadata because the selected word is now visible in the heading before translation finishes.

### Dictionary forms — 2026-10-14

The user requested noun article/gender and full plural in dictionary style, plus principal parts for irregular verbs, and explicitly waived migration. Word prompt v2 and its strict response schema add nullable nounPlural and irregularVerb fields. The compact card shows `die Bank, die Bänke` and, for `gehen`, `ging — ist gegangen` below the infinitive; regular verbs omit the principal-parts row. Plurals are sense-specific, and irregular forms retain separated prefixes and the Perfekt auxiliary.

This affects WordCard, structured response/storage validation, the word prompt and presentation. Existing cards/backups are accepted with missing optional fields; no stores, indexes, database version, learning facts or connection settings are changed or cleared. Fresh explicit taps use the v2 cache identity, without background enrichment. Acceptance includes visible dictionary forms before expansion, regular-verb omission, separable forms, cache/undo integrity, compatible old backups and no overflow at 320/360/390/430 pixels with 200% text.

Local `npm run check` passed with 172 tests and a production build; all five `npm run test:browser` scripts passed with mocked API responses. Current captures: [noun](screenshots/leselampe/word-noun.png), [irregular verb](screenshots/leselampe/word-compact.png), [expanded verb](screenshots/leselampe/word-expanded.png). Deployed CI, real OpenAI responses and Android Chrome were not verified for this change.

Dictionary forms were subsequently committed and deployed as `a984d17`. [GitHub Actions run 38517797430](https://github.com/serssp/vibe/actions/runs/38517797430) passed build, 172 tests, all five browser scripts and Pages deployment. Published JavaScript/CSS SHA-256 hashes matched the checked local build, and the published design suite passed with mocked API responses.

### Word sheet gestures — 2026-10-14

The user requested gesture control and removal of duplicate dialog buttons. Word sheets now expand on an upward swipe and close on a downward swipe, with movement following the finger or mouse. A brief direction hint replaces More and Close buttons. The handle remains a single accessible control for tap/click, Enter/Space and arrow keys; Escape/browser Back close the sheet. Undo mark remains separate and dismissal never undoes learning. Grammar sheet controls are retained.

Affected modules are FloatingSheet, App, the presentation gesture hook, CSS and browser navigation checks. Single-touch and mouse/pen recognition excludes interactive controls, suppresses clicks after dragging and ignores short, horizontal, cancelled and secondary-touch gestures. Expanded explanations preserve native scrolling; downward dismissal starts only from the top of content or the handle. Loading dismissal retains cancellation and pending recovery. This feature changes no data, migrations, caches or AI contracts.

Local `npm run check` passed with 172 tests and a production build; all five `npm run test:browser` scripts passed. Native Chromium touch checks cover body/handle expansion, loading dismissal, cancelled/multiple touches, mouse/keyboard alternatives and scrolling a long explanation, alongside existing mark/undo, recovery, selection geometry and mobile/200% text checks. Captures above were refreshed for the gesture interface. Real OpenAI and Android Chrome checks were not performed.
