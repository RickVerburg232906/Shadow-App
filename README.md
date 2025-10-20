# Fix localhost:5173 (Vite) – Troubleshooting Pack

Gebruik deze stappen wanneer `http://localhost:5173` niet laadt (ERR_CONNECTION_REFUSED).

## Snelcheck (meest voorkomend)
1) **Start de dev-server** in je projectmap:
   - `npm run dev` of `pnpm dev` of `yarn dev` (zie output; er moet "Local: http://localhost:5173" staan).
2) **Forceer Vite om goed te binden** (IPv4/IPv6/proxy issues):
   - Pas je *dev* script aan naar: `vite --host --port 5173 --strictPort`
   - Of gebruik de meegeleverde `templates/package.json` en `templates/vite.config.ts` als referentie.
3) **Poort bezet?** Kill proces op poort 5173 en start opnieuw
   - Windows: `scripts/kill-port-5173.ps1`
   - macOS/Linux: `scripts/kill-port-5173.sh`
4) **Firewall/Antivirus/Proxy/VPN**
   - Sta Node/Vite toe in je firewall.
   - Zet browser/opera proxy uit (geen LAN-proxy).
   - Zet VPN tijdelijk uit om te testen.
5) **Andere terminal al in gebruik?**
   - Eén Vite-instantie tegelijk. Sluit dubbelen of gebruik `--strictPort` om error te zien bij conflict.

## Extra checks
- **Kijk naar de terminal-output** van Vite: errors bij build/TS/ESLint blokkeren de server soms.
- **Clear node-modules cache**: `rm -rf node_modules .vite` en `npm i` (of `pnpm i`, `yarn`), daarna `npm run dev`.
- **WSL/Docker**: Start met `--host` (of `0.0.0.0`) en open via `http://localhost:5173`. Soms is `--host` vereist.
- **HMR in Opera**: voeg `server.hmr.clientPort = 5173` toe in `vite.config.ts` (zie template).

## Hoe deze pack te gebruiken
- **NIETS hoeft overschreven te worden**. Gebruik de templates ter referentie of kopieer gericht.
- Draai een kill-script als de poort vastzit, pas je `package.json` dev-script aan en probeer opnieuw.

## PWA (installable web app)

Deze repository bevat nu een eenvoudige service worker en manifest om de site als PWA te installeren.

Snelle test (lokaal):

1. Build de webassets:

```bash
npm run build
```

2. Serveer de `dist` folder lokaal (bijv. met http-server):

```bash
npm run serve:dist
```

3. Open http://localhost:8080 in je browser of mobiele device. Controleer DevTools → Application → Manifest om validatie te zien.

Belangrijke notities:
- Voeg app icons toe in `assets/icon-192.png` en `assets/icon-512.png` (worden door `manifest.webmanifest` gebruikt).
- De service worker (`sw.js`) is een eenvoudige implementatie (precache + runtime caching). Voor productie kun je Workbox of fijnmaziger caching gebruiken.
