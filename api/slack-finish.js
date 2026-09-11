// api/slack-finish.js
//
// Step 2 of the checkout -> Slack push. Called after the browser has already
// uploaded each file's bytes directly to the upload_url(s) from slack-start.
// This just tells Slack "those uploads are done, attach them to the channel
// with this message text."

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = process.env.SLACK_CHANNEL_ID;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!SLACK_TOKEN || !SLACK_CHANNEL) {
    return res.status(500).json({ error: 'Slack is not configured on the server yet.' });
  }

  try {
    const { text, files } = req.body || {}; // files: [{ file_id, name }]
    const body = {
      files: (files || []).map(f => ({ id: f.file_id, title: f.name })),
      channel_id: SLACK_CHANNEL,
      initial_comment: text || '(checkout with attachments)'
    };
    const r = await fetch('https://slack.com/api/files.completeUploadExternal', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + SLACK_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error);
    res.status(200).json({ done: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
}
