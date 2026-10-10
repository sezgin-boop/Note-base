import { createClient } from '@supabase/supabase-js';
import type { BoardContent } from './types';

// Works with our own VITE_ variables or the ones Vercel's Supabase integration adds.
const env = import.meta.env;
export const SUPABASE_URL: string = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY: string =
  env.VITE_SUPABASE_ANON_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  '';

export const cloudConfigured = !!(SUPABASE_URL && SUPABASE_KEY);
export const supabase = cloudConfigured ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

export const mediaPublicUrl = (id: string) => `${SUPABASE_URL}/storage/v1/object/public/media/${id}`;

export interface RemoteComment {
  id: string;
  boardId: string;
  nodeId: string;
  t: number | null;
  author: string;
  body: string;
  createdAt: string;
  done: boolean;
}

export interface SharedBundle {
  root: string;
  allowComments: boolean;
  boards: { id: string; name: string; icon: string; parentId: string | null; updatedAt: number; content: BoardContent }[];
  comments: RemoteComment[];
}

export async function fetchShared(shareId: string): Promise<SharedBundle | null> {
  if (!supabase) throw new Error('Bulut ayarlanmamış');
  const { data, error } = await supabase.rpc('get_shared', { p_share: shareId });
  if (error) throw error;
  return data as SharedBundle | null;
}

export async function addSharedComment(
  shareId: string,
  c: { boardId: string; nodeId: string; t: number | null; author: string; body: string },
): Promise<string> {
  if (!supabase) throw new Error('Bulut ayarlanmamış');
  const { data, error } = await supabase.rpc('add_shared_comment', {
    p_share: shareId,
    p_board: c.boardId,
    p_node: c.nodeId,
    p_t: c.t,
    p_author: c.author,
    p_body: c.body,
  });
  if (error) throw error;
  return data as string;
}

export const toRemoteComment = (r: any): RemoteComment => ({
  id: r.id,
  boardId: r.board_id ?? r.boardId,
  nodeId: r.node_id ?? r.nodeId,
  t: r.t,
  author: r.author,
  body: r.body,
  createdAt: r.created_at ?? r.createdAt,
  done: r.done,
});
