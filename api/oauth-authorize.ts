// Sign-in page for connecting an AI app: GET shows it, POST checks the password and sends the
// browser back to the app with a one-time code.

import { connectorReady } from '../server/env';
import { checkPassword, CODE_TTL, loginPage, redirectAllowed } from '../server/oauth';
import { seal, unseal } from '../server/seal';

export const config = { runtime: 'edge' };

const PARAMS = [
  'response_type',
  'client_id',
  'redirect_uri',
  'state',
  'code_challenge',
  'code_challenge_method',
  'scope',
  'resource',
];

const plain = (status: number, text: string) =>
  new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

export default async function handler(req: Request): Promise<Response> {
  if (!connectorReady()) return plain(503, 'The Notebase connector is not set up yet: add SUPABASE_SERVICE_ROLE_KEY in Vercel.');
  const form = req.method === 'POST' ? await req.formData() : null;
  const get = (k: string) => String(form?.get(k) ?? new URL(req.url).searchParams.get(k) ?? '');
  const fields = Object.fromEntries(PARAMS.map((k) => [k, get(k)]).filter(([, v]) => v));

  // Problems with the request itself are shown here, never sent to an unverified address.
  const client = await unseal(fields.client_id, 'client');
  if (!client) return plain(400, 'Unknown app. Remove the connector in Claude and add it again.');
  const redirect = fields.redirect_uri || (client.r.length === 1 ? client.r[0] : '');
  if (!redirect || !client.r.includes(redirect) || !redirectAllowed(redirect))
    return plain(400, 'This callback address is not allowed.');

  const back = (params: Record<string, string>) => {
    const u = new URL(redirect);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    if (fields.state) u.searchParams.set('state', fields.state);
    return new Response(null, { status: 302, headers: { location: u.toString(), 'cache-control': 'no-store' } });
  };
  if (fields.response_type !== 'code') return back({ error: 'unsupported_response_type' });
  if (!fields.code_challenge || (fields.code_challenge_method ?? 'S256') !== 'S256')
    return back({ error: 'invalid_request', error_description: 'PKCE with S256 is required.' });

  const app = client.n || 'Claude';
  const host = new URL(redirect).host;
  if (!form) return loginPage({ app, host, fields });

  const email = get('email').trim();
  const uid = await checkPassword(email, get('password'));
  if (!uid) return loginPage({ app, host, fields, email, error: 'Wrong email or password.' });

  const code = await seal({
    t: 'code',
    uid,
    cc: fields.code_challenge,
    ru: redirect,
    cid: fields.client_id,
    exp: Math.floor(Date.now() / 1000) + CODE_TTL,
  });
  return back({ code });
}
