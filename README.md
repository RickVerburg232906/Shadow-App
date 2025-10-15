# Admin Upload (Vite + Firebase)

Eén-knops adminpagina om een Excel of CSV te uploaden naar **Firebase Storage** én te importeren in **Firestore** (`members`-collectie).

## Verwacht bestand
- Excel: `.xlsx` / `.xls` of `.csv`
- Kolommen (case-insensitive): `displayName`, `memberNo` (verplicht), optioneel `active`, `ridesCount`, `uid`
- Als `uid` ontbreekt, wordt `memberNo` als document-ID gebruikt (stabiel updaten).

## Snel starten
1. Vul `src/firebase.js` met jouw Firebase config.
2. (Tijdelijk) Firestore Rules toestaan voor admins of test eenvoudig:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{db}/documents {
       match /members/{id} {
         allow read, write: if true; // alleen voor test!
       }
     }
   }
   ```
   En Storage rule voor test:
   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /{allPaths=**} {
         allow read, write: if true; // alleen voor test!
       }
     }
   }
   ```
   **Zet dit later scherp op alleen admins.**

## Runnen
```bash
npm i
npm run dev
```

## Build (Vercel)
- Preset: **Vite**
- Build Command: `npm run build`
- Output: `dist`
