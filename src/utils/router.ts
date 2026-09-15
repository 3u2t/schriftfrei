export type RouteName = 'home' | 'onboarding' | 'editor' | 'glyphs' | 'documents' | 'settings' | 'fonts';

export function currentRoute(): RouteName {
  const h = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  if (h === '' || h === 'home') return 'home';
  if (h === 'onboarding' || h === 'editor' || h === 'glyphs' || h === 'documents' || h === 'settings' || h === 'fonts') return h;
  return 'home';
}

export function navigate(route: RouteName): void {
  window.location.hash = `#/${route}`;
  window.scrollTo({ top: 0 });
}

export function routeParam(key: string): string | null {
  const h = window.location.hash.split('?')[1];
  if (!h) return null;
  return new URLSearchParams(h).get(key);
}
