# Reader feature

GenerationPanel selects CEFR and duration and invokes injected generation actions. Reader renders tokenized German, mutually exclusive tap/hold gestures and accessible sentence analysis. Completed texts use plain word spans; the explicit new-reading action creates a separate learning session.

use-reading-position saves a stable sentence ID and offset after a 300 ms scroll pause, flushes on visibility/pagehide/navigation and restores on mount. It delegates persistence through a callback independently of network requests. Completion is an injected atomic action. Real Android gestures and abrupt browser termination require separate manual checks.
