This folder contains Firebase Cloud Functions for the New UI (placed inside `new-ui/functions`).

clearOldLunches
- A scheduled function that runs every 60 minutes and clears `lunchChoice`, `participation` and `lunchUpdatedAt` fields
  for member documents whose `updateTime` is older than 24 hours and which currently have `lunchChoice != null`.

How to deploy:
1. Install tools and login:
   npm install -g firebase-tools
   firebase login
2. From the `new-ui/functions/` directory:
   cd new-ui/functions
   npm install
3. Deploy functions (ensure your firebase project is selected):
   firebase deploy --only functions:clearOldLunches

Notes:
- The function uses `DocumentSnapshot.updateTime`, so clients do not strictly need to set a server timestamp when writing lunch data.
- If you prefer explicit timestamps, write `lunchUpdatedAt: serverTimestamp()` from the client.
- Adjust collection name `members` if your data is stored elsewhere.
