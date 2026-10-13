# Working rules

- Read `docs/requirements.md`, `docs/architecture.md`, and `docs/data-model.md` before making changes.
- The user has accepted the MVP and closed its implementation work. Implement only newly requested changes; do not restart the completed stage workflow.
- For each new feature, identify its workflow, affected modules, data changes and migrations, AI contracts, compatibility risks, tests, and acceptance criteria. Implement the smallest sufficient solution.
- TypeScript strict. Do not write comments in source code.
- UI receives use cases through props and does not import Infrastructure. Application depends only on its ports and Domain. Domain does not depend on React, SDKs, or browser APIs. Create concrete adapters only in `src/app/create-services.ts`. Do not add a backend without agreement.
- Write project Markdown documentation and AI prompts in English. Keep prompts in separate files and document their purpose and version.
- Never include the API key in Git, builds, URLs, logs, or exports. Do not display raw API error responses.
- Use a mock provider or mock transport in automated tests. Make real requests only through an explicit user action.
- Required checks: `npm run check` and `npm run test:browser`. Individual commands: typecheck, lint, format:check, check:architecture, test, and build. CI runs the same checks before deployment.
- Verification summaries must distinguish automated mock checks from real OpenAI requests, deployed CI, and Android Chrome verification. Do not claim checks that were not performed.
- Preserve the existing localStorage key and model names. Learning schema changes require ordered migrations and rollback tests. Keep the API key outside learning data; reject invalid records and references atomically. Do not create empty implementations, universal CRUD, or duplicate documents.
- Formatting: Prettier and EditorConfig. Do not reformat the requirements. Maintain the description of layers and current decisions in `docs/architecture.md`.
