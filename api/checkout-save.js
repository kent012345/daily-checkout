// api/checkout-save.js
//
// Saves one day's checkout entry to Vercel Blob storage, keyed by date.
// This project's store is Private, so blobs are saved with access:'private'
// and can only be read back through checkout-get.js (which attaches the
// auth token itself), never via a bare public URL.

const { put } = require('@vercel/blob');

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { date, entry } = req.body || {};
    if (!date || !entry) {
      return res.status(400).json({ error: 'date and entry are required' });
    }
    const auth = blobAuthOptions();
    if (!auth) {
      return res.status(500).json({ error: 'No Blob auth (token or store id) found in this project.' });
    }
    const blob = await put('checkout/' + date + '.json', JSON.stringify(entry), Object.assign({
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json'
    }, auth));
    res.status(200).json({ ok: true, url: blob.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
};
