# Schriftfrei – Dein Text. Deine Handschrift.

Kostenlose Web-App, die beliebigen digitalen Text in deine **eigene Handschrift** verwandelt. Rein lokale Verarbeitung: Handschriftprofile liegen in IndexedDB, Rendering und Export (PNG/JPG/SVG/PDF/GoodNotes-PDF) laufen im Browser – auch offline (PWA).

## Start

```bash
npm install
npm run dev      # Entwicklung
npm run build    # Produktions-Build -> dist/
npm run preview  # Build lokal testen
```

## Hosten

- **Vercel (Free):** Repository importieren, Build-Command `npm run build`, Output `dist` – fertig. Kein Server nötig (`vercel.json` liegt bei).
- **Raspberry Pi + Cloudflare Tunnel:** `dist/` mit beliebigem Static-Server ausliefern, z. B. `npx serve dist` oder nginx, Tunnel darauf zeigen lassen.

## Struktur

```
src/
  components/  UI-Bausteine, Layout/Nav, PageViewer (Live-Vorschau)
  pages/       Landing, Onboarding, Editor, Glyphs, Documents, Settings
  engine/      Handschrift-Engine (types, normalize, metrics, layout, render, demoGenerator, random)
  canvas/      InkCanvas (Maus/Touch/Apple Pencil via Pointer Events)
  training/    Zeichensätze + Trainings-Sätze + Fortschritt
  storage/     IndexedDB (Profile, Dokumente, Einstellungen)
  export/      PNG/JPG/SVG/PDF + GoodNotes-optimiertes PDF
  state/       AppContext (aktives Profil)
  utils/       Router (Hash), cn
```

## Hinweise

- **GoodNotes-Export:** erzeugt ein A4-PDF in hoher Auflösung. In GoodNotes per „Freigeben → In GoodNotes öffnen" importieren.
- **Datenschutz:** keine Server, keine Registrierung, keine Cloud – alles bleibt auf dem Gerät.
