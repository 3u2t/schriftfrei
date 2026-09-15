import { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import Layout from './components/Layout';
import SiteBeacon from './components/SiteBeacon';
import { AppProvider } from './state/AppContext';
import { applyRouteTitle, currentRoute, type RouteName } from './utils/router';
import LandingPage from './pages/LandingPage';
import OnboardingPage from './pages/OnboardingPage';
import EditorPage from './pages/EditorPage';
import GlyphsPage from './pages/GlyphsPage';
import DocumentsPage from './pages/DocumentsPage';
import FontsPage from './pages/FontsPage';
import SettingsPage from './pages/SettingsPage';

function initTheme(): void {
  try {
    const saved = localStorage.getItem('schriftfrei-theme');
    const dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch {

  }
  if (!window.location.hash) window.location.hash = '#/home';
}

export default function App() {
  const [route, setRoute] = useState<RouteName>(() => {
    initTheme();
    const r = currentRoute();
    applyRouteTitle(r);
    return r;
  });

  useEffect(() => {
    const onHash = () => {
      const r = currentRoute();
      setRoute(r);
      applyRouteTitle(r);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <AppProvider>
      <SiteBeacon />
      <Layout>
        {route === 'home' && <LandingPage />}
        {route === 'onboarding' && <OnboardingPage />}
        {route === 'editor' && <EditorPage key={window.location.hash} />}
        {route === 'glyphs' && <GlyphsPage />}
        {route === 'documents' && <DocumentsPage />}
        {route === 'fonts' && <FontsPage />}
        {route === 'settings' && <SettingsPage />}
      </Layout>
      <Analytics />
    </AppProvider>
  );
}
