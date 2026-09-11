// api/checkout-get.js
//
// Fetches one day's checkout entry content. Needed because this store is
// private -- its blob URLs require the auth token to actually read, so the
// browser can't just fetch them directly. This route does that fetch
// server-side (with the token attached) and hands back plain JSON.

const { list } = require('@vercel/blob');

function blobAuthOptions() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return { token: process.env.BLOB_READ_WRITE_TOKEN };
  }
  if (process.env.BLOB_STORE_ID) {
    return { storeId: process.env.BLOB_STORE_ID };
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    const date = (req.query && req.query.date) || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'valid date query param required' });
    }
    const auth = blobAuthOptions();
    if (!auth) {
      return res.status(500).json({ error: 'No Blob auth (token or store id) found in this project.' });
    }
    const pathname = 'checkout/' + date + '.json';
    const result = await list(Object.assign({ prefix: pathname }, auth));
    const blob = result.blobs.find((b) => b.pathname === pathname);
    if (!blob) return res.status(404).json({ error: 'not found' });

    const headers = {};
    if (auth.token) headers.Authorization = 'Bearer ' + auth.token;
    const fileRes = await fetch(blob.url, { headers });
    if (!fileRes.ok) {
      return res.status(502).json({ error: 'could not read stored file: ' + fileRes.status });
    }
    const text = await fileRes.text();
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(text);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
};
