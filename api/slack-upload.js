// api/slack-upload.js
//
// Relays one attachment's raw bytes to a Slack upload_url (from
// slack-start's files.getUploadURLExternal call) server-to-server.
//
// The browser can't POST directly to Slack's upload_url itself -- Slack's
// upload endpoint doesn't send CORS headers for arbitrary web origins, so
// a direct browser fetch fails with a generic "Failed to fetch" network
// error before Slack ever responds. Routing it through our own server
// avoids that (server-to-server requests aren't subject to CORS).
//
// This only works for files under Vercel's ~4.5MB function request body
// limit -- anything bigger is rejected here so the frontend can skip it
// and note it as "not attached" instead of failing the whole submission.

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const uploadUrl = req.query && req.query.url;
    if (!uploadUrl) return res.status(400).json({ error: 'url query param required' });

    const body = await readRawBody(req);
    const slackRes = await fetch(uploadUrl, { method: 'POST', body });
    if (!slackRes.ok) {
      return res.status(502).json({ error: 'Slack rejected the upload (HTTP ' + slackRes.status + ')' });
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
};
