# Learning data model and schema

Status: stages 3–5. Database `vibe.learning`, IndexedDB schema version 2. All relationship fields use stable string IDs; timestamps use ISO 8601 UTC with a trailing `Z`. Export format and import validation will be defined in stage 7.

## Entities

| Entity             | Store          | Data                                                                                                                                                             |
| ------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TextDocument       | `texts`        | Title, complete German content, ordered `{id, content}` sentences, CEFR level, duration, creation time, model/prompt version, target and included vocabulary IDs |
| ReadingSession     | `sessions`     | Text ID, New/InProgress/Completed status, nullable start/completion times, `{sentenceId, scrollOffset}` position, review candidate IDs                           |
| VocabularyEntry    | `vocabulary`   | Lemma, part of speech, nullable article, Russian meaning, sense key, Unknown/Learned state, creation/last-mark times, unknown/exposure counters                  |
| WordInteraction    | `interactions` | Session/text/vocabulary/sentence IDs, surface form, MarkUnknown/UndoMarkUnknown action, nullable undo target, timestamp                                          |
| WordExposure       | `exposures`    | Session/vocabulary IDs, markedUnknown flag, completion timestamp                                                                                                 |
| GrammarExplanation | `explanations` | Text/sentence IDs, CEFR level, structured Russian rules, relevant German fragments and `{de, ru}` examples, model/prompt version, creation time                  |
| AppSettings        | `appSettings`  | Singleton ID `app`, CEFR level, duration, model and UI fontScale; no API key                                                                                     |

The seven primary entities are supplemented by two stage 4 records:

| Entity          | Store              | Data                                                                                                                                                                                            |
| --------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WordLookup      | `wordLookups`      | Stable intent ID, exact WordSelection, creation time, model/prompt version, Pending/Resolved/Cancelled lifecycle, nullable vocabulary/interaction/translation IDs, previous mark state for undo |
| WordTranslation | `wordTranslations` | Immutable contextual card, text/sentence IDs and UTF-16 start/end offsets, vocabulary ID, model/prompt version; noun gender, expression and Russian form explanation                            |

Exact TypeScript contracts live in `src/domain/`. Shapes are runtime-validated by `domain/learning/validation.ts`. Unsupported fields are rejected, including credentials added to settings or nested structures. The API key is stored separately under `vibe.openai-api-key`; the existing connection model remains under `vibe.openai-model`.

Sentence IDs are supplied by the application and preserved by storage, unique within a document. Sentence contents reconstruct the full document after whitespace normalization. Generation requests ordered complete sentences from the model, builds the document content from them, and assigns IDs from the document UUID plus sentence order. The adapter never segments or renumbers stored text. A saved sentence ID is the reading-position anchor; scrollOffset is a nonnegative pixel offset for future reader recovery.

`senseKey` identifies a verified meaning, not spelling. A vocabulary identity is the tuple `(lemma, partOfSpeech, senseKey)`; different senses of the same spelling may coexist. LookupWord supplies full sentence context and up to 100 recent candidates to the model. It reuses a candidate only after an explicit meaning match and validation of candidate ID, normalized lemma, part of speech and article. A new or ambiguous meaning receives a new senseKey UUID. Inflections, separable verbs and expressions are explained in the stored contextual card. The storage layer does not guess matches or merge spellings.

`undoesInteractionId` is required for UndoMarkUnknown and null for MarkUnknown. It links an undo to the original mark in the same session, for the same vocabulary entry, surface form, and sentence. Each resolved lookup creates one MarkUnknown. Undo appends an UndoMarkUnknown and cancels the lookup in one transaction. Repeated undo is idempotent. Effective marks in the current session and the saved previous status restore a learned word after an accidental tap; out-of-order undo does not erase other marks. A newly created entry with all marks undone remains as an inactive record with unknownCount 0 so immutable references stay valid; it is omitted from the personal list and must not be selected for adaptive review merely from its status.

## Indexes

All stores use primary key `id`.

| Store            | Index                                                           | Uniqueness                                                      |
| ---------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| sessions         | `byText`: textId                                                | Nonunique; completed and later sessions remain separate records |
| vocabulary       | `bySense`: lemma/partOfSpeech/senseKey                          | Unique                                                          |
| interactions     | `bySession`: sessionId                                          | Nonunique                                                       |
| interactions     | `byUndo`: undoesInteractionId                                   | Unique; null mark targets are not IndexedDB keys                |
| exposures        | `bySession`: sessionId                                          | Nonunique                                                       |
| exposures        | `bySessionVocabulary`: sessionId/vocabularyEntryId              | Unique                                                          |
| explanations     | `byCacheKey`: textId/sentenceId/cefrLevel/aiModel/promptVersion | Unique                                                          |
| wordLookups      | `bySession`: selection.sessionId                                | Nonunique                                                       |
| wordLookups      | `byVocabulary`: vocabularyEntryId                               | Nonunique; unresolved null IDs are not indexed                  |
| wordTranslations | `byContext`: textId/sentenceId/start/end/aiModel/promptVersion  | Unique                                                          |

Event query results currently follow IndexedDB primary-key order, not chronological order. Future presentation must sort by timestamp when chronology is required. There is no fixed record-count limit.

## Atomic writes and validation

The Application port accepts `LearningWrite`, a typed batch containing the seven primary record categories plus word lookups and translations. Missing categories are unchanged. There is no generic CRUD or learning-data deletion API. The adapter copies the batch before asynchronous work. All record writes and reference checks occur in one transaction over the learning stores; records can reference other records supplied in the same batch regardless of input ordering.

Checks include valid levels/durations and UTC dates, nonnegative finite positions, integer counters, valid lifecycle metadata, unique sentence/relationship IDs, and existing vocabulary/text/session references. An interaction must point to its session's text and an existing sentence; an undo must refer to an original mark. An exposure requires a completed session, its exact completion timestamp, a review candidate, and that candidate's confirmed included ID in the document. Grammar explanations must refer to existing sentences. Bad shapes, dangling references, conflicting IDs, and index violations roll back every write in the batch.

Documents, interactions, exposures, explanations and translations are immutable. Repeating an identical write under the same ID is safe; a conflicting rewrite is rejected. A different exposure ID for the same session/vocabulary pair is rejected by the unique index. Vocabulary identity and creation time cannot be rewritten. An unfinished session may progress and save position, but it cannot change text or regress from InProgress to New. Completed sessions are immutable.

Stages 3–5 add generation, explicit marks/undos and grammar caching on the atomic persistence foundation. They do not implement the completion algorithm. Stage 6 will derive exposure facts and computed vocabulary state together with session completion. It must enforce first-session learning restrictions, effective marks/undos, verified occurrence detection, and transition history. The database does not certify that included IDs actually match German meanings merely because they were supplied in a batch.

## Lookup and cache integrity

Before requesting translation, the application saves a Pending intent that references an InProgress session, its exact text/sentence, a valid token and surface-form offsets. The key is never part of this record. An AI or cancellation error leaves the Pending intent available after reload for explicit retry or cancellation. A cancelled intent cannot later be resolved by an outstanding request.

Resolution rereads the current word and contextual cache inside the same transaction, records the previous status/last-mark/count snapshot, updates Unknown state, saves the immutable translation and interaction, and changes the intent to Resolved. This protects counters and card identity across concurrent connections. The cache key includes offsets so identical spelling twice in a sentence can have distinct context. Reusing a card still records a fresh user mark; reusing the same resolved intent does not create another mark. Model/prompt changes use a new cache key. A retry uses the pending intent's original model/version; an outdated prompt asks the user to cancel and tap again.

Grammar uses the existing byCacheKey index and does not touch word stores. Application validation requires each grammar fragment to appear in the selected sentence. Generated text and grammar remain immutable when prompts change. Contextual cards keep form/meaning data while VocabularyEntry supplies the stable verified sense identity.

The latest generated text and its unfinished session are restored locally. Documents are retained without a fixed limit; the history UI is deferred to stage 7. The initial session provides the relationships required by word actions. Position autosave, completion, exposures, and adaptive review remain stage 6.

## Migrations and failures

`infrastructure/storage/schema.ts` defines schema version 2 and ordered migrations 1 and 2. A new database starts at version 0; migration 1 creates stores and indexes in the IndexedDB upgrade transaction. There was no prior learning database to transform. Migration 2 adds wordLookups/wordTranslations stores and their indexes without changing the original seven stores or existing records. The actual v1-to-v2 upgrade is tested. Existing connection settings are not touched.

Future migrations run in integer version order within one upgrade transaction. Missing migrations, synchronous failures, and asynchronous constraint failures abort the upgrade; the original version, stores, and records remain available. The adapter never falls back to deleting the database. Newer databases are refused by older code. Existing connections close on versionchange. Blocked requests return a fixed error and cannot silently upgrade later after being rejected.

Transaction promises resolve only after commit. Capacity and IO failures produce fixed safe errors and no partial state. Browser eviction, device loss, and clearing site data can still remove local storage, as accepted in the requirements. Export/import and a user-facing storage-recovery workflow are later-stage work.
