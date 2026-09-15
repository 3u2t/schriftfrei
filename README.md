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
- **Datenschutz:** Handschriftprofile, Dokumente und Einstellungen bleiben lokal auf dem Gerät (IndexedDB) – keine Registrierung, keine Cloud. Einzige Server-Berührung: ein anonymer Besuchs-Zähler (siehe Ops).

## Ops (Vercel)

- **Besuchs-Tracking (`/api/health`):** antwortet mit einem 1×1-GIF, deduped pro IP (60 s, best-effort im Speicher), blockt Bot-User-Agents mit 403. Reichert Besuche mit grober Geo- + Geräte-Erkennung an und meldet sie optional per Discord – dazu im Vercel-Dashboard unter Settings → Environment Variables `DISCORD_WEBHOOK_URL` setzen (Production). Ohne die Variable läuft der Endpoint einfach nur als GIF-Antwort. Webhook nie committen.
- **Bot-Schutz (`middleware.js`):** Scraper-User-Agents (`curl`, `wget`, `python-requests`, `headlesschrome`, `sqlmap` …) bekommen 403, gleiche Liste wie der Beacon. Leere User-Agents bleiben erlaubt (Privacy-Browser).
- **`vercel.json`:** SPA-Fallback ohne `/api/*`, Security-Header (`nosniff`, strikte Referrer-Policy, `DENY`-Framing, minimale Permissions-Policy).
- **Raspberry Pi:** nur `dist/` ausliefern – `/api/*` und Middleware gibt es dort nicht, die App läuft trotzdem (Beacon schlägt still fehl).
- **Hinweis:** Besucher-IPs sind personenbezogene Daten (DSGVO) – der Disclosure-Hinweis steht im Landing-Footer und in den Einstellungen.
