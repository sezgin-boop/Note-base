// Token endpoint: trades a sign-in code (with its PKCE verifier) or a refresh token for an access token.

import { connectorReady } from '../server/env';
import { ACCESS_TTL, CORS, json, oauthError, REFRESH_TTL } from '../server/oauth';
import { seal, sha256b64url, unseal } from '../server/seal';

export const config = { runtime: 'edge' };

async function tokens(uid: string) {
  const now = Math.floor(Date.now() / 1000);
  return json({
    access_token: await seal({ t: 'access', uid, exp: now + ACCESS_TTL }),
    token_type: 'Bearer',
    expires_in: ACCESS_TTL,
    refresh_token: await seal({ t: 'refresh', uid, exp: now + REFRESH_TTL }),
    scope: 'notebase',
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return oauthError('invalid_request', 'Use POST.', 405);
  if (!connectorReady()) return oauthError('server_error', 'The Notebase connector is not set up yet.', 503);

  const type = req.headers.get('content-type') ?? '';
  const p: Record<string, string> = type.includes('application/json')
    ? await req.json().catch(() => ({}))
    : Object.fromEntries([...(await req.formData().catch(() => new FormData())).entries()].map(([k, v]) => [k, String(v)]));
  // client_secret_basic: the client id may come in the Authorization header.
  const basic = req.headers.get('authorization')?.match(/^Basic\s+(.+)$/i)?.[1];
  const clientId = p.client_id || (basic ? decodeURIComponent(atob(basic).split(':')[0]) : '');

  if (p.grant_type === 'authorization_code') {
    const code = await unseal(p.code, 'code');
    if (!code) return oauthError('invalid_grant', 'The sign-in code is invalid or expired.');
    if (clientId && clientId !== code.cid) return oauthError('invalid_grant', 'The code was issued to another app.');
    if (p.redirect_uri && p.redirect_uri !== code.ru) return oauthError('invalid_grant', 'redirect_uri does not match.');
    if (!p.code_verifier || (await sha256b64url(p.code_verifier)) !== code.cc)
      return oauthError('invalid_grant', 'PKCE verification failed.');
    return tokens(code.uid);
  }
  if (p.grant_type === 'refresh_token') {
    const refresh = await unseal(p.refresh_token, 'refresh');
    if (!refresh) return oauthError('invalid_grant', 'The refresh token is invalid or expired. Connect again.');
    return tokens(refresh.uid);
  }
  return oauthError('unsupported_grant_type', 'Use authorization_code or refresh_token.');
}
