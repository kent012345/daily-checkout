// api/checkout-save.js
//
// Saves one day's checkout entry to Vercel Blob storage, keyed by date.
// Whether a given store requires access:'public' or access:'private' isn't
// something we can inspect ahead of time, and it's changed under us before
// (recreating/reconnecting a store can flip it) -- so this tries one mode
// and falls back to the other if Blob rejects it, rather than hard-coding
// a guess that breaks the next time the store changes.

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

async function putWithAccessFallback(pathname, body, baseOptions) {
  try {
    return await put(pathname, body, Object.assign({ access: 'public' }, baseOptions));
  } catch (e) {
    if (/must be 'private'|private store/i.test(String(e.message || e))) {
      return await put(pathname, body, Object.assign({ access: 'private' }, baseOptions));
    }
    throw e;
  }
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
    const blob = await putWithAccessFallback('checkout/' + date + '.json', JSON.stringify(entry), Object.assign({
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
