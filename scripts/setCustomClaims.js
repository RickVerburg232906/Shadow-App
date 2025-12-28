// Usage: node scripts/setCustomClaims.js <uid> <role>
// Replace service account path with your own JSON file downloaded from Firebase Console.
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

const uid = process.argv[2];
const role = process.argv[3];

if (!uid || !role) {
  console.error('Usage: node scripts/setCustomClaims.js <uid> <role>');
  console.error('Example roles: admin, inschrijftafel');
  process.exit(1);
}

const allowed = ['admin', 'inschrijftafel'];
if (!allowed.includes(role)) {
  console.error('Role must be one of:', allowed.join(', '));
  process.exit(1);
}

const expiry = Math.floor(Date.now() / 1000) + 60; // 1 minute from now (seconds)
admin.auth().setCustomUserClaims(uid, { role, roleExpiry: expiry })
  .then(() => {
    console.log('Custom claim set for', uid, '->', role, 'expires@', expiry);
    console.log('The user must sign out/in to refresh their ID token.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error setting custom claim:', err);
    process.exit(1);
  });
