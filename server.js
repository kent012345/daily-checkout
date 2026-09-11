// server.js
//
// Local dev server for the Daily Checkout app. Runs everything on your own
// computer at http://localhost:3000 -- no Vercel account or deployment needed.
//
// Storage: saved checkouts are written as plain JSON files into ./data/
// (instead of Vercel Blob, which is only available once this is deployed).
//
// Slack posting: only works locally if you set SLACK_BOT_TOKEN and
// SLACK_CHANNEL_ID as environment variables before starting this server.
// If they're not set, saving still works fine -- you'll just see a
// "Slack post failed, but nothing was lost" message, which is expected.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = process.env.SLACK_CHANNEL_ID;

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
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

async function handleApi(req, res, pathname, query) {
  if (pathname === '/api/checkout-list' && req.method === 'GET') {
    const files = fs.readdirSync(DATA_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
    return sendJson(res, 200, { dates: files.map(f => f.replace('.json', '')) });
  }

  if (pathname === '/api/checkout-get' && req.method === 'GET') {
    const date = query.get('date') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return sendJson(res, 400, { error: 'valid date query param required' });
    const file = path.join(DATA_DIR, date + '.json');
    if (!fs.existsSync(file)) return sendJson(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(fs.readFileSync(file));
    return;
  }

  if (pathname === '/api/checkout-save' && req.method === 'POST') {
    const body = await readBody(req);
    const { date, entry } = body || {};
    if (!date || !entry) return sendJson(res, 400, { error: 'date and entry are required' });
    fs.writeFileSync(path.join(DATA_DIR, date + '.json'), JSON.stringify(entry));
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/slack-start' && req.method === 'POST') {
    if (!SLACK_TOKEN || !SLACK_CHANNEL) return sendJson(res, 500, { error: 'Slack is not configured on this local server. Set SLACK_BOT_TOKEN and SLACK_CHANNEL_ID env vars to test Slack posting locally.' });
    try {
      const { text, files } = await readBody(req);
      if (!files || !files.length) {
        await slackForm('chat.postMessage', { channel: SLACK_CHANNEL, text: text || '(empty checkout)' });
        return sendJson(res, 200, { done: true });
      }
      const uploads = [];
      for (const f of files) {
        const data = await slackForm('files.getUploadURLExternal', { filename: f.name, length: String(f.size) });
        uploads.push({ tempId: f.tempId, name: f.name, upload_url: data.upload_url, file_id: data.file_id });
      }
      return sendJson(res, 200, { done: false, uploads });
    } catch (e) {
      return sendJson(res, 500, { error: String(e.message || e) });
    }
  }

  if (pathname === '/api/slack-finish' && req.method === 'POST') {
    if (!SLACK_TOKEN || !SLACK_CHANNEL) return sendJson(res, 500, { error: 'Slack is not configured on this local server.' });
    try {
      const { text, files } = await readBody(req);
      const r = await fetch('https://slack.com/api/files.completeUploadExternal', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + SLACK_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: (files || []).map(f => ({ id: f.file_id, title: f.name })),
          channel_id: SLACK_CHANNEL,
          initial_comment: text || '(checkout with attachments)'
        })
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error);
      return sendJson(res, 200, { done: true });
    } catch (e) {
      return sendJson(res, 500, { error: String(e.message || e) });
    }
  }

  sendJson(res, 404, { error: 'not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:' + PORT);
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, pathname, url.searchParams);
    } catch (e) {
      sendJson(res, 500, { error: String(e.message || e) });
    }
    return;
  }

  const filePath = pathname === '/' ? path.join(__dirname, 'index.html') : path.join(__dirname, pathname);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('Daily Checkout running at http://localhost:' + PORT);
  if (!SLACK_TOKEN || !SLACK_CHANNEL) {
    console.log('(Slack posting disabled locally -- set SLACK_BOT_TOKEN and SLACK_CHANNEL_ID env vars to enable it.)');
  }
});
