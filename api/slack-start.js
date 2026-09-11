// api/slack-start.js
//
// Step 1 of the checkout -> Slack push.
//
// - No attachments: post the text straight to Slack and we're done.
// - Attachments present: ask Slack for a direct upload URL per file. The
//   browser then sends the (possibly large) file bytes straight to Slack —
//   never through this function — because Vercel functions cap request
//   bodies at 4.5MB, well under a 100MB video. Slack's own upload service is
//   built for exactly this kind of direct-from-browser upload.
//
// Requires two environment variables set in the Vercel project:
//   SLACK_BOT_TOKEN   - a Slack bot token with chat:write, files:write, files:read
//   SLACK_CHANNEL_ID  - the channel to post into (e.g. C0123ABCDEF)

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = process.env.SLACK_CHANNEL_ID;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function slackForm(method, params) {
  const res = await fetch('https://slack.com/api/' + method, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + SLACK_TOKEN,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(params)
  });
  const data = await res.json();
  if (!data.ok) throw new Error(method + ': ' + data.error);
  return data;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!SLACK_TOKEN || !SLACK_CHANNEL) {
    return res.status(500).json({ error: 'Slack is not configured on the server yet.' });
  }

  try {
    const { text, files } = req.body || {};

    if (!files || !files.length) {
      await slackForm('chat.postMessage', { channel: SLACK_CHANNEL, text: text || '(empty checkout)' });
      return res.status(200).json({ done: true });
    }

    const uploads = [];
    for (const f of files) {
      const data = await slackForm('files.getUploadURLExternal', {
        filename: f.name,
        length: String(f.size)
      });
      uploads.push({ tempId: f.tempId, name: f.name, upload_url: data.upload_url, file_id: data.file_id });
    }
    res.status(200).json({ done: false, uploads: uploads });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
}
