-- Notebase cloud schema for Supabase.
-- Paste this whole file into Supabase → SQL Editor → Run. It is safe to run again.

-- Boards: one row per board, the whole canvas lives in `content`.
create table if not exists public.boards (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  icon text not null default '📁',
  parent_id text,
  content jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  updated_at bigint not null default 0,
  share_id text unique,
  share_comments boolean not null default true
);
-- Columns added after the first release (safe to re-run).
alter table public.boards add column if not exists inbox boolean not null default false;
create index if not exists boards_user_idx on public.boards (user_id);
create index if not exists boards_parent_idx on public.boards (parent_id);

alter table public.boards enable row level security;
drop policy if exists "boards: owner" on public.boards;
create policy "boards: owner" on public.boards
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Comments and approvals left by clients on shared boards (owner comments live in the board content).
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  board_id text not null references public.boards (id) on delete cascade,
  node_id text not null,
  t real,
  author text not null default 'Guest',
  body text not null,
  created_at timestamptz not null default now(),
  done boolean not null default false
);
alter table public.comments add column if not exists version text;
-- 'comment', 'approval' (a client approving a video version) or 'markup' (a client's drawing).
alter table public.comments add column if not exists kind text not null default 'comment';
alter table public.comments alter column author set default 'Guest';
create index if not exists comments_board_idx on public.comments (board_id);

alter table public.comments enable row level security;
drop policy if exists "comments: board owner" on public.comments;
create policy "comments: board owner" on public.comments
  for all to authenticated
  using (exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid()));

-- Board ids reachable from a share token: the shared board and all of its sub-boards.
create or replace function public.shared_board_ids(p_share text)
returns table (id text)
language sql stable security definer set search_path = public as $$
  with recursive tree as (
    select b.id, b.user_id from public.boards b where b.share_id = p_share and p_share is not null
    union all
    select c.id, c.user_id from public.boards c join tree t on c.parent_id = t.id and c.user_id = t.user_id
  )
  select tree.id from tree;
$$;
revoke all on function public.shared_board_ids(text) from public, anon, authenticated;

-- Everything a viewer of a share link may see, in one call.
create or replace function public.get_shared(p_share text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when r.id is null then null else jsonb_build_object(
    'root', r.id,
    'allowComments', r.share_comments,
    'boards', (
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'icon', b.icon, 'parentId', b.parent_id,
        'updatedAt', b.updated_at, 'content', b.content))
      from public.boards b where b.id in (select id from public.shared_board_ids(p_share))
    ),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'boardId', c.board_id, 'nodeId', c.node_id, 't', c.t,
        'author', c.author, 'body', c.body, 'createdAt', c.created_at, 'done', c.done,
        'version', c.version, 'kind', c.kind)
        order by c.created_at)
      from public.comments c where c.board_id in (select id from public.shared_board_ids(p_share))
    ), '[]'::jsonb)
  ) end
  from (select 1) one
  left join public.boards r on r.share_id = p_share;
$$;
grant execute on function public.get_shared(text) to anon, authenticated;

-- Clients add comments (and approvals) through this function only, and only when the owner allows it.
drop function if exists public.add_shared_comment(text, text, text, real, text, text);
create or replace function public.add_shared_comment(
  p_share text, p_board text, p_node text, p_t real, p_author text, p_body text,
  p_version text default null, p_kind text default 'comment')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if not exists (select 1 from public.boards where share_id = p_share and share_comments) then
    raise exception 'comments are not allowed on this link';
  end if;
  if p_board not in (select id from public.shared_board_ids(p_share)) then
    raise exception 'board is not part of this share';
  end if;
  -- markup: shapes a client drew on the board (JSON, so it may be longer than a comment)
  if p_kind not in ('comment', 'approval', 'markup') then
    raise exception 'unknown kind';
  end if;
  if coalesce(length(trim(p_body)), 0) = 0 or length(p_body) > (case when p_kind = 'markup' then 50000 else 2000 end) then
    raise exception 'comment is empty or too long';
  end if;
  insert into public.comments (board_id, node_id, t, author, body, version, kind)
  values (p_board, left(p_node, 64), p_t, left(coalesce(nullif(trim(p_author), ''), 'Guest'), 60), p_body,
          left(p_version, 32), p_kind)
  returning id into new_id;
  return new_id;
end;
$$;
grant execute on function public.add_shared_comment(text, text, text, real, text, text, text, text) to anon, authenticated;

-- Media (images / videos). Public bucket with unguessable file names, so share links
-- and AI tools can load images directly.
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

drop policy if exists "media: upload" on storage.objects;
create policy "media: upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media');

drop policy if exists "media: owner delete" on storage.objects;
create policy "media: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and owner = auth.uid());
