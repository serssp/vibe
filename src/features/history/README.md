# History feature

HistoryList renders retained text/session metadata in pages of 20. It receives records and open callbacks from App; it does not read IndexedDB. Opening completed readings selects them for viewing; new learning sessions require the explicit Reader action.

BackupPanel receives typed BackupActions for export/preview and a restore callback. File selection, download and replacement confirmation are UI concerns. Preview performs no writes; restore is atomic and validated by the repository. No API key enters the backup format.
