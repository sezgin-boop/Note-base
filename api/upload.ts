// Upload link for a board (made by the Claude connector's get_upload_link tool):
//   GET  /api/upload?t=…                     → a small page to pick photos / videos (phone or computer)
//   POST /api/upload?t=…&name=…               → the file as the request body (≤ 4 MB; for scripts / curl)
//   POST /api/upload?t=…&step=sign&type=…     → an address to send a bigger file to directly
//   POST /api/upload?t=…&step=done&id=…&type=… → put that file on the board
// Every file becomes an image or video card on the board the link was made for.

import { nanoid } from 'nanoid';
import { connectorReady, originOf } from '../server/env';
import { getBoard, mediaExists, signedUploadUrl, uploadMedia } from '../server/db';
import { imageAspect } from '../server/media';
import { unseal } from '../server/seal';
import { MAX_DIRECT, MAX_FILE, placeUpload, uploadKind } from '../server/uploads';

export const config = { runtime: 'edge' };

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS },
  });

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: { ...CORS, 'access-control-allow-methods': 'GET, POST' } });
  if (!connectorReady()) return json({ error: 'Uploads are not set up on this site.' }, 503);
  const url = new URL(req.url);
  const token = url.searchParams.get('t') ?? '';
  const link = await unseal(token, 'upload');
  if (!link) {
    return req.method === 'GET'
      ? page('This upload link has expired', '<p class="muted">Ask Claude for a new one.</p>', 410)
      : json({ error: 'This upload link has expired or is invalid. Ask for a new one.' }, 410);
  }
  const board = await getBoard(link.uid, link.board);
  if (!board) return json({ error: 'The board no longer exists.' }, 404);

  if (req.method === 'GET') return uploadPage(board.name, board.id, token, link.exp);
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const step = url.searchParams.get('step');
  const type = (url.searchParams.get('type') || req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const caption = url.searchParams.get('caption')?.slice(0, 300) || undefined;
  if (!uploadKind(type)) return json({ error: `Only images and videos can be uploaded (got "${type || 'unknown'}").` }, 415);

  try {
    if (step === 'sign') {
      const size = Number(url.searchParams.get('size') ?? 0);
      if (size > MAX_FILE) return json({ error: 'The file is larger than 50 MB.' }, 413);
      const id = nanoid(21);
      return json({ id, upload: await signedUploadUrl(id) });
    }
    if (step === 'done') {
      const id = url.searchParams.get('id') ?? '';
      if (!/^[\w-]{21}$/.test(id) || !(await mediaExists(id))) return json({ error: 'The file did not arrive.' }, 400);
      const aspect = Number(url.searchParams.get('aspect')) || null;
      const { node } = await placeUpload(link.uid, link.board, token, { mediaId: id, type, caption, aspect });
      return json({ ok: true, card: node.id, board: board.name });
    }
    // Direct upload: the file is the body.
    const data = await req.arrayBuffer();
    if (!data.byteLength) return json({ error: 'The request had no file in it.' }, 400);
    if (data.byteLength > MAX_DIRECT)
      return json({ error: 'Too large for a direct upload (max 4 MB). Resize it, or use the upload page.' }, 413);
    const id = nanoid(21);
    await uploadMedia(id, data, type);
    const aspect = type.startsWith('image/') ? imageAspect(new Uint8Array(data, 0, Math.min(data.byteLength, 65536))) : null;
    const name = url.searchParams
      .get('name')
      ?.replace(/\.[a-z0-9]+$/i, '')
      .slice(0, 120);
    const { node } = await placeUpload(link.uid, link.board, token, { mediaId: id, type, caption: caption ?? name, aspect });
    return json({ ok: true, card: node.id, board: board.name, open: `${originOf(req)}/?board=${link.board}` });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function page(title: string, body: string, status = 200, script = '') {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{color-scheme:dark;--bg:#0b0b0d;--card:#141418;--line:#26262d;--text:#ececf1;--muted:#8b8b96;--brand:#8b5cf6}
@media (prefers-color-scheme:light){:root{color-scheme:light;--bg:#f4f4f7;--card:#fff;--line:#e2e2e8;--text:#17171c;--muted:#6b6b76}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,sans-serif;padding:16px}
.box{width:100%;max-width:420px;background:var(--card);border:1px solid var(--line);border-radius:22px;padding:24px}
.logo{width:44px;height:44px;border-radius:13px;background:linear-gradient(135deg,#8b5cf6,#6366f1);display:grid;place-items:center;color:#fff;font-size:22px;margin-bottom:12px}
h1{font-size:20px;margin:0 0 4px}.muted{color:var(--muted);font-size:14px;margin:0 0 16px}
.pick{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:28px 16px;border:2px dashed var(--line);border-radius:18px;cursor:pointer;text-align:center;transition:border-color .15s,background .15s}
.pick:hover,.pick.drag{border-color:var(--brand);background:color-mix(in srgb,var(--brand) 8%,transparent)}
.pick b{font-size:16px}.pick span{color:var(--muted);font-size:13px}
input[type=file]{display:none}
ul{list-style:none;margin:16px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
li{display:flex;align-items:center;gap:10px;font-size:13px}
li img,li .vid{width:44px;height:44px;border-radius:10px;object-fit:cover;background:var(--line);flex:none;display:grid;place-items:center}
li .name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
li .st{color:var(--muted);font-size:12px;white-space:nowrap}li .st.ok{color:#34d399}li .st.err{color:#f87171}
.bar{height:4px;border-radius:4px;background:var(--line);overflow:hidden;margin-top:4px}.bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#8b5cf6,#6366f1);transition:width .2s}
a.open{display:none;margin-top:18px;text-align:center;padding:12px;border-radius:12px;background:linear-gradient(135deg,#8b5cf6,#6366f1);color:#fff;text-decoration:none;font-weight:600}
small{display:block;color:var(--muted);font-size:12px;margin-top:14px;text-align:center}
</style></head><body><div class="box">${body}</div>${script ? `<script>${script}</script>` : ''}</body></html>`,
    {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-frame-options': 'DENY',
      },
    },
  );
}

function uploadPage(boardName: string, boardId: string, token: string, exp: number) {
  const minutes = Math.max(1, Math.round((exp - Date.now() / 1000) / 60));
  const body = `<div class="logo">✦</div>
<h1>Add to “${esc(boardName)}”</h1>
<p class="muted">Pick photos or videos — they go straight onto the board.</p>
<label class="pick" id="pick"><b>📷 Choose photos or videos</b><span>or drop them here · up to 50 MB each</span>
<input id="file" type="file" accept="image/*,video/*" multiple></label>
<ul id="list"></ul>
<a class="open" id="open" href="/?board=${encodeURIComponent(boardId)}">Open the board</a>
<small>This link works for ${minutes} more minutes.</small>`;
  const script = `
const T = ${JSON.stringify(token)};
const api = (q) => '/api/upload?t=' + encodeURIComponent(T) + '&' + new URLSearchParams(q);
const list = document.getElementById('list');
const aspectOf = (file) => new Promise((res) => {
  if (!file.type.startsWith('image/')) return res(null);
  const img = new Image(); img.onload = () => { res(img.naturalWidth / img.naturalHeight); URL.revokeObjectURL(img.src); }; img.onerror = () => res(null);
  img.src = URL.createObjectURL(file);
});
async function send(file) {
  const li = document.createElement('li');
  const thumb = file.type.startsWith('image/') ? '<img src="' + URL.createObjectURL(file) + '">' : '<span class="vid">🎬</span>';
  li.innerHTML = thumb + '<div class="name">' + file.name.replace(/[<>&]/g, '') + '<div class="bar"><i></i></div></div><span class="st">Waiting…</span>';
  list.appendChild(li);
  const st = li.querySelector('.st'), bar = li.querySelector('.bar i');
  try {
    if (!/^(image|video)\\//.test(file.type)) throw new Error('Not a photo or video');
    st.textContent = 'Uploading…';
    const type = file.type, caption = file.name.replace(/\\.[a-z0-9]+$/i, '');
    const s = await fetch(api({ step: 'sign', type, size: file.size }), { method: 'POST' }).then((r) => r.json());
    if (!s.upload) throw new Error(s.error || 'Could not start');
    await new Promise((ok, fail) => {
      const x = new XMLHttpRequest(); x.open('PUT', s.upload); x.setRequestHeader('content-type', type);
      x.upload.onprogress = (e) => e.lengthComputable && (bar.style.width = (e.loaded / e.total * 100) + '%');
      x.onload = () => (x.status < 300 ? ok() : fail(new Error('Upload failed (' + x.status + ')'))); x.onerror = () => fail(new Error('Network error'));
      x.send(file);
    });
    const aspect = await aspectOf(file);
    const d = await fetch(api({ step: 'done', id: s.id, type, caption, aspect: aspect || '' }), { method: 'POST' }).then((r) => r.json());
    if (!d.ok) throw new Error(d.error || 'Could not add it');
    bar.style.width = '100%'; st.textContent = '✓ On the board'; st.className = 'st ok';
    document.getElementById('open').style.display = 'block';
  } catch (e) { st.textContent = e.message; st.className = 'st err'; }
}
async function sendAll(files) { for (const f of files) await send(f); }
document.getElementById('file').onchange = (e) => sendAll([...e.target.files]);
const pick = document.getElementById('pick');
pick.ondragover = (e) => { e.preventDefault(); pick.classList.add('drag'); };
pick.ondragleave = () => pick.classList.remove('drag');
pick.ondrop = (e) => { e.preventDefault(); pick.classList.remove('drag'); sendAll([...e.dataTransfer.files]); };
`;
  return page(`Add to ${boardName}`, body, 200, script);
}
