// OAuth 2.1 for the Claude connector (authorization code + PKCE, dynamic client registration),
// as the MCP spec asks for. Stateless: clients, codes and tokens are sealed payloads (see seal.ts).
// The login itself is the user's Notebase (Supabase) email and password.

import { keyHeaders, SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

export const ACCESS_TTL = 8 * 3600;
export const REFRESH_TTL = 180 * 24 * 3600;
export const CODE_TTL = 5 * 60;

export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS, ...headers },
  });

export const oauthError = (error: string, description: string, status = 400) =>
  json({ error, error_description: description }, status);

/**
 * Only AI apps' own callback addresses may receive sign-in codes, so a link made by someone else
 * can't send your access to their site. Claude uses claude.ai / claude.com; desktop and command-line
 * clients use a local address.
 */
export function redirectAllowed(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash) return false;
  const host = u.hostname;
  if (u.protocol === 'http:') return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  if (u.protocol !== 'https:') return false;
  return ['claude.ai', 'claude.com', 'anthropic.com'].some((d) => host === d || host.endsWith(`.${d}`));
}

/** The user's id if the email and password are right. */
export async function checkPassword(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { ...keyHeaders(SUPABASE_ANON_KEY), 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.user?.id ?? null;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The sign-in page shown when connecting an AI app. */
export function loginPage(o: { app: string; host: string; fields: Record<string, string>; error?: string; email?: string }) {
  const hidden = Object.entries(o.fields)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('');
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect ${esc(o.app)} to Notebase</title>
<style>
:root{color-scheme:dark;--bg:#0b0b0d;--card:#141418;--line:#26262d;--text:#ececf1;--muted:#8b8b96;--brand:#7c5cf0}
@media (prefers-color-scheme:light){:root{color-scheme:light;--bg:#f4f4f7;--card:#fff;--line:#e2e2e8;--text:#17171c;--muted:#6b6b76}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,sans-serif;padding:16px}
.box{width:100%;max-width:380px;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px}
.logo{width:44px;height:44px;border-radius:13px;background:linear-gradient(135deg,#8b5cf6,#6366f1);display:grid;place-items:center;color:#fff;font-size:22px;margin-bottom:14px}
h1{font-size:20px;margin:0 0 6px}p{color:var(--muted);margin:0 0 18px;font-size:14px}
ul{color:var(--muted);font-size:13px;padding-left:18px;margin:0 0 18px}
label{display:block;font-size:13px;color:var(--muted);margin:12px 0 5px}
input{width:100%;padding:11px 12px;border-radius:11px;border:1px solid var(--line);background:transparent;color:var(--text);font-size:16px}
input:focus{outline:2px solid var(--brand);border-color:transparent}
button{width:100%;margin-top:18px;padding:12px;border:0;border-radius:12px;background:linear-gradient(135deg,#8b5cf6,#6366f1);color:#fff;font-size:15px;font-weight:600;cursor:pointer}
.err{background:rgba(248,113,113,.12);color:#f87171;border-radius:10px;padding:9px 12px;font-size:13px;margin-bottom:6px}
small{display:block;color:var(--muted);font-size:12px;margin-top:14px;text-align:center}
</style></head><body><form class="box" method="post" autocomplete="on">
<div class="logo">✦</div>
<h1>Connect ${esc(o.app)} to Notebase</h1>
<p>Sign in with your Notebase account. <b>${esc(o.app)}</b> (${esc(o.host)}) will be able to:</p>
<ul><li>read your boards, cards and video comments</li><li>add and edit cards, photos and videos, and create boards</li></ul>
${o.error ? `<div class="err">${esc(o.error)}</div>` : ''}
${hidden}
<label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="username" value="${esc(o.email ?? '')}">
<label for="password">Password</label><input id="password" name="password" type="password" required autocomplete="current-password">
<button type="submit">Sign in and allow</button>
<small>You can disconnect any time from ${esc(o.app)}'s connector settings.</small>
</form></body></html>`,
    {
      status: o.error ? 401 : 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-frame-options': 'DENY',
        'content-security-policy':
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https: http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'",
        'referrer-policy': 'no-referrer',
      },
    },
  );
}
