// CommonJS version — run with: node scripts/createAuthUsers.cjs
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

const users = [
  { email: 'admin@shadow-app.local', password: 'admin?', role: 'admin' },
  { email: 'inschrijftafel@shadow-app.local', password: 'Shadow', role: 'inschrijftafel' }
];

async function upsert(email, password, role) {
  try {
    let user;
    try {
      user = await admin.auth().getUserByEmail(email);
      await admin.auth().updateUser(user.uid, { password });
      console.log('Updated user password for', email);
    } catch (e) {
      if (e.code === 'auth/user-not-found' || e.code === 'auth/user-not-found') {
        user = await admin.auth().createUser({ email, password, emailVerified: true });
        console.log('Created user', email);
      } else {
        throw e;
      }
    }

    const expiry = Math.floor(Date.now() / 1000) + 60;
    await admin.auth().setCustomUserClaims(user.uid, { role, roleExpiry: expiry });
    console.log(`Set custom claim role='${role}' for ${email} (uid=${user.uid}) expires@${expiry}`);

    return { uid: user.uid };
  } catch (err) {
    console.error('Error upserting user', email, err);
    throw err;
  }
}

(async () => {
  try {
    const results = [];
    for (const u of users) {
      const r = await upsert(u.email, u.password, u.role);
      results.push({ email: u.email, uid: r.uid });
    }

    try {
      const db = admin.firestore();
      await db.doc('globals/passwords').set({ inschrijftafel: users[1].password, hoofdadmin: users[0].password }, { merge: true });
      console.log('Wrote passwords to globals/passwords document in Firestore (for compatibility).');
    } catch (e) {
      console.warn('Could not update globals/passwords in Firestore:', e.message || e);
    }

    console.log('Done. Users upserted:', results);
    process.exit(0);
  } catch (e) {
    console.error('Failed to create/update users', e);
    process.exit(1);
  }
})();
