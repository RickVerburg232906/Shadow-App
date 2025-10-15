# Shadow App (Fixed) — Excel upload werkt ✨

Eenvoudige Vite + Firebase webapp:
- **Lid**: zoek op achternaam (`Naam`) → toon naam/LidNr + QR (payload bevat alleen `uid` = LidNr).
- **Admin**: upload Excel/CSV met verplichte kolommen → import naar Firestore-collectie `members` (document-id = `LidNr`). Het originele bestand wordt ook opgeslagen in Cloud Storage onder `imports/`.

## Snel starten
```bash
npm i
npm run dev
```
Open de URL die Vite toont.

## Firebase configureren
Pas eventueel `src/firebase.js` aan met je eigen `firebaseConfig`. De huidige config komt uit je ZIP.

## Excel/CSV
Verplichte kolommen (exact): `LidNr`, `Naam`, `Voor naam`, `Voor letters`, `Tussen voegsel`.

## Waar komen de data?
- **Firestore**: collectie `members`, doc-id = `LidNr`. Velden: dezelfde kolommen + `ridesCount` (default 0).
- **Storage**: het geüploade bronbestand onder `imports/<timestamp>-<filename>`.

## Opmerkingen
- Geen App Check en geen admin-wachtwoord in deze minimale versie (simpelst zodat upload zeker werkt). Later kun je dit aanscherpen (claims/rules).
- Batch-commit na max ~480 writes om onder de Firestore-limiet van 500 te blijven.
