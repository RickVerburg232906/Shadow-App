// Usage: node scripts/setCustomClaimsByEmail.js <email> <role>
// Example: node scripts/setCustomClaimsByEmail.js admin@shadow-app.local admin
// Requires a service account JSON at project root named `serviceAccountKey.json`.
const admin = require('firebase-admin');
const path = require('path');

const svcPath = path.resolve(__dirname, '..', 'serviceAccountKey.json');
try {
  const serviceAccount = require(svcPath);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} catch (e) {
  console.error('Failed to load service account JSON at', svcPath);
  console.error('Place your service account JSON at the project root as serviceAccountKey.json');
  process.exit(1);
}

const email = process.argv[2];
const role = process.argv[3];

if (!email || !role) {
  console.error('Usage: node scripts/setCustomClaimsByEmail.js <email> <role>');
  process.exit(1);
}

const allowed = ['admin', 'inschrijftafel'];
if (!allowed.includes(role)) {
  console.error('Role must be one of:', allowed.join(', '));
  process.exit(1);
}

(async () => {
  try {
    const user = await admin.auth().getUserByEmail(email);
    const expiry = Math.floor(Date.now() / 1000) + 60; // 1 minute from now
    await admin.auth().setCustomUserClaims(user.uid, { role, roleExpiry: expiry });
    console.log(`Set role='${role}' for user ${email} (uid=${user.uid}) expires@${expiry}.`);
    console.log('User must sign out and sign in again to refresh their ID token.');
    process.exit(0);
  } catch (err) {
    console.error('Error setting custom claim for', email, err);
    process.exit(1);
  }
})();
