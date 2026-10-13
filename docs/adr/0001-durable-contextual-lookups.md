# Durable contextual word lookups

Date: 2026-10-13. Status: implemented.

A tap must survive an AI error before the application knows the lemma or sense. Persist a WordLookup intent before requesting translation, with exact source context and no credential. Keep failed intents available for explicit retry/cancellation after reload.

Resolve the intent, immutable contextual card, vocabulary state and WordInteraction in one IndexedDB transaction. Reread the current cache/word inside that transaction to preserve concurrent marks. Save the previous mark state so undo can append evidence and reverse the specific action without deleting history.

Each translation cache key includes the original sentence/token offsets, model and prompt version. Existing vocabulary identity is reused only after an explicit contextual sense verification. Distinct or uncertain meanings keep separate IDs. This supports inflections and expressions while retaining exact original user actions for the learning algorithm.
