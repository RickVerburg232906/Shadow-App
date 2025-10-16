# Shadow App — Mobile Optimized 📱

Deze versie is geoptimaliseerd voor telefoons:
- Grote touch targets (≥44px), duidelijke knoppen en invoervelden.
- QR-bibliotheek wordt **lazy** geladen bij starten van de scanner (snellere eerste load).
- QR-grootte schaalt mee met schermbreedte (tot 320px).
- Suggestielijst is scrolbaar en 'tap-vriendelijk'.
- Safe-area aware (iOS): toasts en topbar houden rekening met notch.
- `viewport-fit=cover` en PWA-manifest aanwezig.

## Gebruik
```bash
npm i
npm run dev
```
Open de URL die Vite toont.

> Productie-tip: verplaats het +1 zetten van `ridesCount` naar een Cloud Function en beveilig Firestore met rules.
