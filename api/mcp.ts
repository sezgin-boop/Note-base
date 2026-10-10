// Notebase as a Claude connector: a remote MCP server (Streamable HTTP, JSON responses).
// Add https://<your-site>/mcp in Claude → Settings → Connectors → Add custom connector.
// Sign-in goes through api/oauth.ts; every call acts as the signed-in Notebase user.

import { connectorReady, originOf } from '../server/env';
import { unseal } from '../server/seal';
import { INSTRUCTIONS, TOOLS } from '../server/tools';

export const config = { runtime: 'edge' };

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id',
  'access-control-expose-headers': 'www-authenticate, mcp-session-id',
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS, ...headers } });

interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: any;
}

const result = (id: RpcRequest['id'], r: unknown) => ({ jsonrpc: '2.0', id, result: r });
const error = (id: RpcRequest['id'], code: number, message: string) => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: { code, message },
});

async function handle(msg: RpcRequest, uid: string, origin: string) {
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion;
      return result(msg.id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'notebase', title: 'Notebase', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return result(msg.id, {});
    case 'tools/list':
      return result(msg.id, {
        tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({
          name,
          title,
          description,
          inputSchema,
          ...(annotations ? { annotations: { title, ...annotations } } : {}),
        })),
      });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) return error(msg.id, -32602, `Unknown tool: ${msg.params?.name}`);
      try {
        const text = await tool.run(msg.params?.arguments ?? {}, { uid, origin });
        return result(msg.id, { content: [{ type: 'text', text }] });
      } catch (e) {
        // Tool errors go back to the model as text so it can correct itself.
        return result(msg.id, { content: [{ type: 'text', text: (e as Error).message }], isError: true });
      }
    }
    case 'resources/list':
      return result(msg.id, { resources: [] });
    case 'prompts/list':
      return result(msg.id, { prompts: [] });
    default:
      return error(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

export default async function handler(req: Request): Promise<Response> {
  const origin = originOf(req);
  if (req.method === 'OPTIONS')
    return new Response(null, {
      status: 204,
      headers: { ...CORS, 'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS' },
    });
  if (!connectorReady())
    return json(
      error(null, -32000, 'The Notebase connector is not set up: add SUPABASE_SERVICE_ROLE_KEY in Vercel (see README).'),
      503,
    );

  const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const access = await unseal(token, 'access');
  if (!access)
    return json(error(null, -32001, 'Sign in to Notebase to use this connector.'), 401, {
      'www-authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
    });

  // No server-to-client stream: everything is answered in the POST response.
  if (req.method !== 'POST') return json(error(null, -32000, 'Use POST.'), 405, { allow: 'POST' });

  let body: RpcRequest | RpcRequest[];
  try {
    body = await req.json();
  } catch {
    return json(error(null, -32700, 'Parse error'), 400);
  }
  const batch = Array.isArray(body) ? body : [body];
  const run = async () => {
    const replies = [];
    for (const msg of batch) {
      if (!msg || typeof msg.method !== 'string') {
        replies.push(error(msg?.id, -32600, 'Invalid request'));
        continue;
      }
      // Notifications (no id) get no reply.
      if (msg.id === undefined || msg.id === null) continue;
      replies.push(await handle(msg, access.uid, origin));
    }
    return Array.isArray(body) ? replies : replies[0];
  };

  // Tool calls can take a while (downloading a video). The platform wants a response to start within
  // ~25 s, so when the client accepts it, answer as a stream that opens right away.
  const slow = batch.some((m) => m?.method === 'tools/call');
  if (slow && (req.headers.get('accept') ?? '').includes('text/event-stream')) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const ping = setInterval(() => controller.enqueue(encoder.encode(': working\n\n')), 10000);
        try {
          const reply = await run();
          if (reply) controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(reply)}\n\n`));
        } finally {
          clearInterval(ping);
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', ...CORS } });
  }

  const reply = await run();
  if (!reply || (Array.isArray(reply) && !reply.length)) return new Response(null, { status: 202, headers: CORS });
  return json(reply);
}
