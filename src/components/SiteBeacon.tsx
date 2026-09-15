import { useEffect } from 'react';

export default function SiteBeacon() {
  useEffect(() => {
    if (typeof Image === 'undefined') return;
    const img = new Image();
    img.src = '/api/health';
  }, []);
  return null;
}
