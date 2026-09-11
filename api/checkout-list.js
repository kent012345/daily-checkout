// api/checkout-list.js
//
// Lists every saved checkout date. Just returns { dates: [...] } -- the
// actual content for a given date is fetched (with auth) via checkout-get.js,
// since this store is private and its URLs aren't publicly readable.

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
    const auth = blobAuthOptions();
    if (!auth) {
      return res.status(500).json({ error: 'No Blob auth (token or store id) found in this project.' });
    }
    const result = await list(Object.assign({ prefix: 'checkout/' }, auth));
    const dates = [];
    for (const blob of result.blobs) {
      const match = blob.pathname.match(/checkout\/(\d{4}-\d{2}-\d{2})\.json$/);
      if (!match) continue;
      dates.push(match[1]);
    }
    res.status(200).json({ dates });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
};
