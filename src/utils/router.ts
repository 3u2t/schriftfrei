export type RouteName = 'home' | 'onboarding' | 'editor' | 'glyphs' | 'documents' | 'settings' | 'fonts';

const TITLES: Record<RouteName, string> = {
  home: 'Schriftfrei – Deine Handschrift',
  onboarding: 'Training – Schriftfrei',
  editor: 'Editor – Schriftfrei',
  glyphs: 'Meine Handschrift – Schriftfrei',
  documents: 'Dokumente – Schriftfrei',
  settings: 'Einstellungen – Schriftfrei',
  fonts: 'Fertige Schriften – Schriftfrei',
};

export function applyRouteTitle(route: RouteName): void {
  try {
    document.title = TITLES[route];
  } catch {
    // Kein DOM (Tests) – ignorieren.
  }
}

export function currentRoute(): RouteName {
  const h = window.location.hash
    .replace(/^#\/?/, '')
    .split('?')[0]
    .replace(/\/+$/, '')
    .toLowerCase();
  if (h === '' || h === 'home') return 'home';
  if (h === 'onboarding' || h === 'editor' || h === 'glyphs' || h === 'documents' || h === 'settings' || h === 'fonts') return h;
  return 'home';
}

export function navigate(route: RouteName): void {
  window.location.hash = `#/${route}`;
  window.scrollTo({ top: 0 });
  applyRouteTitle(route);
}

export function routeParam(key: string): string | null {
  const h = window.location.hash.split('?')[1];
  if (!h) return null;
  return new URLSearchParams(h).get(key);
}
