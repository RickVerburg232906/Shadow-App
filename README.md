# Leden QR (Vite + Firebase)

Een minimalistische ledenpagina: lid vult naam in → app zoekt `members` in Firestore → toont naam, lidnummer en genereert een QR met alleen `uid`.

## Snel starten
1. **Firebase project** aanmaken → Firestore **aan**.
2. In **Project settings → Your apps → Web → Config** kopieer je de config en plak je die in `src/firebase.js` bij `firebaseConfig`.
3. (Voor demo) Firestore rules tijdelijk open voor read:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{db}/documents {
       match /members/{uid} {
         allow read: if true;
         allow write: if false;
       }
     }
   }
   ```
4. Voeg in de collectie `members` bv. een doc toe:
   - ID: `abc123`
   - `displayName: "Jan Jansen"`
   - `memberNo: "LID-001"`
   - `active: true`

## Runnen
```bash
npm i
npm run dev
```
Open http://localhost:5173

## Build (voor Vercel)
```bash
npm run build
```
Output komt in `dist/`.

- **Vercel**: kies “Vite” preset, Build Command `npm run build`, Output `dist`.
- Commit **één** lockfile (bv. `package-lock.json`).

## Opmerking
Dit is de ledenkant. De admin-scanner (QR scannen + ritten verhogen via Cloud Function) kan later worden toegevoegd.
