import type { SettingsActions } from '../application/use-cases/settings';
import { SettingsPage } from '../features/settings/SettingsPage';

export function App({ settings }: { settings: SettingsActions }) {
  return <SettingsPage settings={settings} />;
}
