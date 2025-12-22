const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Scheduled function: runs hourly and clears lunchChoice/participation if the document
// was last updated more than 24 hours ago.
exports.clearOldLunches = functions.pubsub.schedule('every 60 minutes').onRun(async (context) => {
  const cutoffMillis = Date.now() - 24 * 60 * 60 * 1000;
  const cutoffTs = admin.firestore.Timestamp.fromMillis(cutoffMillis);
  console.log('clearOldLunches running; cutoff=', cutoffTs.toDate().toISOString());

  const collection = db.collection('members');
  // Query for documents that likely have lunch data (filter to reduce reads).
  // Firestore can't query on updateTime, so we filter on lunchChoice != null (exists).
  const q = collection.where('lunchChoice', '!=', null).limit(500);

  let totalUpdated = 0;
  try {
    const snap = await q.get();
    if (snap.empty) {
      console.log('No members with lunchChoice found');
      return null;
    }

    const batch = db.batch();
    let ops = 0;

    snap.forEach(doc => {
      try {
        const updateTime = doc.updateTime; // Firestore admin DocumentSnapshot.updateTime
        if (!updateTime) return;
        const updateMillis = updateTime.toMillis();
        if (updateMillis <= cutoffMillis) {
          const ref = doc.ref;
          batch.update(ref, {
            lunchChoice: null,
            participation: null,
            // Optionally clear any timestamp field if you stored one
            lunchUpdatedAt: null
          });
          ops++;
        }
      } catch (e) {
        console.error('error processing doc', doc.id, e);
      }
    });

    if (ops > 0) {
      await batch.commit();
      totalUpdated += ops;
      console.log('Cleared lunch fields on', ops, 'documents');
    } else {
      console.log('No lunch fields needed clearing this run');
    }
  } catch (e) {
    console.error('clearOldLunches error', e);
  }

  return { cleared: totalUpdated };
});
