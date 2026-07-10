const NHTSA_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/';
const ALLOWED_ORIGINS = [
  'https://my.geotab.com',
  'https://my3.geotab.com',
  'https://my4.geotab.com',
  'https://my5.geotab.com'
];

function cors(origin) {
  const allowed = ALLOWED_ORIGINS.find((value) => origin.startsWith(value));
  return {
    'Access-Control-Allow-Origin': allowed || 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    Vary: 'Origin'
  };
}

function cleanVin(value) {
  return String(value || '').toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
}

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '';
  const headers = cors(origin);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (!ALLOWED_ORIGINS.some((value) => origin.startsWith(value))) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let vins;
  try { vins = JSON.parse(event.body || '{}').vins || []; } catch (_) { vins = []; }
  vins = [...new Set(vins.map(cleanVin).filter((vin) => vin.length === 17))].slice(0, 50);
  if (!vins.length) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Supply one or more valid VINs' }) };

  const results = {};
  await Promise.all(vins.map(async (vin) => {
    try {
      const response = await fetch(`${NHTSA_URL}${encodeURIComponent(vin)}?format=json`);
      if (!response.ok) return;
      const row = (await response.json()).Results?.[0] || {};
      const make = String(row.Make || '').trim();
      const model = String(row.Model || '').trim();
      const year = String(row.ModelYear || '').match(/^(19|20)\d{2}$/)?.[0] || '';
      if (make || model || year) results[vin] = { make, model, year };
    } catch (error) {
      console.warn(`VIN decode failed for ${vin}:`, error.message);
    }
  }));
  return { statusCode: 200, headers, body: JSON.stringify({ results }) };
};
