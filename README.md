# Shadow App (Fixed) — Excel upload werkt ✨

Eenvoudige Vite + Firebase webapp:
- **Lid**: zoek op achternaam (`Naam`) → toon naam/LidNr + QR (payload bevat alleen `uid` = LidNr).
- **Admin**: upload Excel/CSV met verplichte kolommen → import naar Firestore-collectie `members` (document-id = `LidNr`). Het originele bestand kan (optioneel) naar Storage.

## Wat is verbeterd in deze update
- ✅ Betere UX: hover states, nette spacing, duidelijke result-grid met QR-caption.
- ✅ Member-zoek: Enter selecteert topresultaat; resultaat wordt verborgen bij nieuwe input.
- ✅ Admin-upload: debounce tegen dubbelklikken + validatie van `LidNr`.
- ✅ Scanner: cooldown blijft behouden binnen de tab (sessionStorage).
- ✅ Firestore: `experimentalAutoDetectLongPolling` voor stabielere verbindingen.
- ✅ Opschoning CSS: dubbele definities verwijderd; knoppen consistenter.
- 🧱 index.html: `<script src="./main.js">` zodat Vite/preview correct werkt.

## Snel starten
```bash
npm i
npm run dev
```
Open de URL die Vite toont.

## Excel/CSV
Verplichte kolommen (exact): `LidNr`, `Naam`, `Voor naam`, `Voor letters`, `Tussen voegsel`.

## Firestore
- **members**: doc-id = `LidNr`. Velden: dezelfde kolommen + `ridesCount` (default 0).

> Voor productie: verplaats `ridesCount`-increment naar een **Cloud Function** en scherm gegevens af met **Security Rules**.
