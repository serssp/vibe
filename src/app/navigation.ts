import { useSyncExternalStore } from 'react';

export type Screen = 'library' | 'reader' | 'vocabulary' | 'settings';
export type Panel = 'generation' | 'appearance' | 'analysis' | 'help';

function subscribe(change: () => void) {
  window.addEventListener('popstate', change);
  window.addEventListener('hashchange', change);
  return () => {
    window.removeEventListener('popstate', change);
    window.removeEventListener('hashchange', change);
  };
}

export function useNavigation() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  const [path, query] = hash.slice(1).split('?');
  const [destination, id] = (path || 'library').split('/');
  const screen: Screen = ['library', 'reader', 'vocabulary', 'settings'].includes(destination ?? '')
    ? (destination as Screen)
    : 'library';
  let textId: string | undefined;
  try {
    textId = id ? decodeURIComponent(id) : undefined;
  } catch {
    textId = undefined;
  }
  const requested = new URLSearchParams(query).get('panel');
  const panel = ['generation', 'appearance', 'analysis', 'help'].includes(requested ?? '')
    ? (requested as Panel)
    : undefined;
  return { screen, textId, panel };
}

export function navigate(screen: Screen, textId?: string, panel?: Panel, replace = false) {
  const hash = `#${screen}${textId ? `/${encodeURIComponent(textId)}` : ''}${panel ? `?panel=${panel}` : ''}`;
  const state = { vibePanel: !!panel, vibeReader: screen === 'reader' && !panel };
  if (replace) window.history.replaceState(state, '', hash);
  else window.history.pushState(state, '', hash);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function dismissPanel(screen: Screen, textId?: string) {
  if (window.history.state?.vibePanel) window.history.back();
  else navigate(screen, textId, undefined, true);
}
