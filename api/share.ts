// Server-rendered share page: /s/<id> (HTML), /s/<id>/md (Markdown), /s/<id>/json.
// Everything is in the response itself, so it can be read without running JavaScript —
// by people with slow phones, link previews and AI tools alike.

import { boardsToHtml, boardsToMarkdown, type OutlineOptions } from '../src/share/outline';

export const config = { runtime: 'edge' };

const env = (...names: string[]) => names.map((n) => process.env[n]).find(Boolean) ?? '';
const SUPABASE_URL = env('VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL');
const SUPABASE_KEY = env(
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
);

const page = (status: number, title: string, text: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${title}</title><body style="font-family:system-ui;background:#0b0b0d;color:#ececf1;display:grid;place-items:center;height:100vh;margin:0">` +
      `<div style="text-align:center;max-width:420px;padding:16px"><h1 style="font-size:22px">${title}</h1><p style="color:#8b8b96">${text}</p></div>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? '';
  const format = url.searchParams.get('format') ?? 'html';
  if (!/^[\w-]{6,64}$/.test(id)) return page(404, 'Board not found', 'This link looks incorrect.');
  if (!SUPABASE_URL || !SUPABASE_KEY) return page(503, 'Cloud not set up', 'This site is not connected to its cloud yet.');

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_shared`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      // Legacy anon keys are JWTs and go in Authorization too; new publishable keys must not.
      ...(SUPABASE_KEY.startsWith('eyJ') ? { authorization: `Bearer ${SUPABASE_KEY}` } : {}),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_share: id }),
  });
  if (!res.ok) return page(502, 'Could not load the board', 'Please try again in a moment.');
  const bundle = await res.json();
  if (!bundle) return page(404, 'Board not found', 'This link was turned off or is incorrect.');

  const origin = `${url.protocol}//${url.host}`;
  const opts: OutlineOptions = {
    rootId: bundle.root,
    mediaUrl: (mediaId) => `${SUPABASE_URL}/storage/v1/object/public/media/${mediaId}`,
    viewUrl: `${origin}/?share=${id}`,
    markdownUrl: `${origin}/s/${id}/md`,
    comments: bundle.comments ?? [],
  };
  const boards = (bundle.boards ?? []).map((b: any) => ({ ...b, content: b.content ?? { nodes: [], edges: [] } }));
  const headers = { 'cache-control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=60' };

  if (format === 'md') {
    return new Response(boardsToMarkdown(boards, opts), {
      headers: { ...headers, 'content-type': 'text/markdown; charset=utf-8' },
    });
  }
  if (format === 'json') {
    return new Response(JSON.stringify(bundle, null, 2), {
      headers: { ...headers, 'content-type': 'application/json; charset=utf-8' },
    });
  }
  return new Response(boardsToHtml(boards, opts), { headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
}
