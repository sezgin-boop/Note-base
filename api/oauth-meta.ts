// OAuth discovery for the Claude connector:
//   /.well-known/oauth-protected-resource   → which server signs users in for /mcp
//   /.well-known/oauth-authorization-server → that server's endpoints

import { originOf } from '../server/env';
import { CORS, json } from '../server/oauth';

export const config = { runtime: 'edge' };

export default function handler(req: Request): Response {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const origin = originOf(req);
  if (new URL(req.url).searchParams.get('type') === 'resource')
    return json({
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      bearer_methods_supported: ['header'],
      resource_name: 'Notebase',
      scopes_supported: ['notebase'],
    });
  return json({
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth-authorize`,
    token_endpoint: `${origin}/api/oauth-token`,
    registration_endpoint: `${origin}/api/oauth-register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: ['notebase'],
  });
}
