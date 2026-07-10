const admin = require('firebase-admin');
const COLLECTION = 'fuel_idle_cost';
const ORIGINS = ['https://my.geotab.com', 'https://my3.geotab.com', 'https://my4.geotab.com', 'https://my5.geotab.com'];

function headers(origin) {
  const allowed = ORIGINS.find((item) => origin.startsWith(item));
  return { 'Access-Control-Allow-Origin': allowed || 'null', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json', Vary: 'Origin' };
}
function db() {
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n') }) });
  return admin.firestore();
}
function schedule(value, database) {
  const source = value || {};
  const emails = Array.isArray(source.emails) ? [...new Set(source.emails.map((item) => String(item).trim().toLowerCase()).filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)))] : [];
  return { enabled: !!source.enabled && emails.length > 0, emails, freq: ['daily', 'weekly', 'biweekly', 'monthly'].includes(source.freq) ? source.freq : 'weekly', time: /^([01]\d|2[0-3]):[0-5]\d$/.test(source.time) ? source.time : '08:00', start: /^\d{4}-\d{2}-\d{2}$/.test(source.start) ? source.start : '', dataRange: ['last_3_months', 'last_month', 'last_week'].includes(source.dataRange) ? source.dataRange : 'last_3_months', database_name: database };
}
exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '';
  const responseHeaders = headers(origin);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: responseHeaders, body: '' };
  if (!ORIGINS.some((item) => origin.startsWith(item))) return { statusCode: 403, headers: responseHeaders, body: JSON.stringify({ error: 'Forbidden' }) };
  const database = String(event.queryStringParameters?.db || '').trim();
  if (!database) return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ error: 'Missing db' }) };
  try {
    const firestore = db();
    const snapshot = await firestore.collection(COLLECTION).where('database_name', '==', database).limit(1).get();
    const ref = snapshot.empty ? firestore.collection(COLLECTION).doc() : snapshot.docs[0].ref;
    if (snapshot.empty) await ref.set({ database_name: database, schedule: schedule({}, database), created_at: admin.firestore.FieldValue.serverTimestamp() });
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      await ref.set({ database_name: database, schedule: schedule(body.schedule, database), updated_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    } else if (event.httpMethod !== 'GET') return { statusCode: 405, headers: responseHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
    const doc = await ref.get();
    return { statusCode: 200, headers: responseHeaders, body: JSON.stringify({ config: { database_name: database, schedule: schedule(doc.data().schedule, database) } }) };
  } catch (error) { console.error(error); return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ error: 'Configuration service unavailable' }) }; }
};
