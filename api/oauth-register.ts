// Dynamic client registration (RFC 7591): an AI app registers itself before signing in.
// The returned client_id carries its allowed callback addresses (sealed), so nothing is stored.

import { connectorReady } from '../server/env';
import { CORS, json, oauthError, redirectAllowed } from '../server/oauth';
import { seal } from '../server/seal';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return oauthError('invalid_request', 'Use POST.', 405);
  if (!connectorReady()) return oauthError('server_error', 'The Notebase connector is not set up yet.', 503);
  const body = await req.json().catch(() => null);
  const uris: string[] = Array.isArray(body?.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (!uris.length) return oauthError('invalid_redirect_uri', 'redirect_uris is required.');
  const bad = uris.find((u) => !redirectAllowed(u));
  if (bad) return oauthError('invalid_redirect_uri', `This connector only works with Claude (not allowed: ${bad}).`);
  const name = String(body?.client_name ?? 'Claude').slice(0, 60);
  const method = ['client_secret_post', 'client_secret_basic'].includes(body?.token_endpoint_auth_method)
    ? body.token_endpoint_auth_method
    : 'none';
  const clientId = await seal({ t: 'client', r: uris, n: name });
  return json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: method,
      // Public clients prove themselves with PKCE; a secret is handed out only to clients that insist on one.
      ...(method !== 'none' ? { client_secret: crypto.randomUUID(), client_secret_expires_at: 0 } : {}),
    },
    201,
  );
}
