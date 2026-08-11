-- ─────────────────────────────────────────────────────────────────────────────
-- Bugs & Ideas kit — feedback_items table (standalone).
--
-- Merged from Balance's two feedback migrations, with app-specific pieces
-- (the profiles table, is_admin/is_admin_or_supervisor role helpers) removed
-- so it runs on any Supabase project. Idempotent where practical.
--
-- Screenshots are stored inline as compressed JPEG data URLs (low volume) so
-- the kit works without a storage bucket, in both remote and localStorage
-- fallback modes.
-- ─────────────────────────────────────────────────────────────────────────────

-- updated_at trigger helper (no-op if your project already has one).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.feedback_items (
  id                 uuid primary key default gen_random_uuid(),
  kind               text not null default 'note'
                       check (kind in ('bug', 'idea', 'note')),
  title              text not null,
  description        text not null default '',
  context            text not null default '',   -- "where / expected" line
  screenshot         text not null default '',   -- compressed JPEG data URL
  status             text not null default 'New'
                       check (status in ('New', 'Acknowledged', 'In Progress', 'Revisit', 'Shipped', 'Won''t Fix')),
  submitted_by       uuid references auth.users(id) on delete set null,
  submitted_by_name  text not null default '',
  resolution_note    text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.feedback_items is
  'App-level feedback (notes / features / bugs) filed from the Bugs & Ideas kit.';

create index if not exists feedback_items_created_at_idx on public.feedback_items (created_at desc);
create index if not exists feedback_items_status_idx     on public.feedback_items (status);

drop trigger if exists feedback_items_set_updated_at on public.feedback_items;
create trigger feedback_items_set_updated_at
  before update on public.feedback_items
  for each row execute function public.set_updated_at();

-- ─── Row Level Security ────────────────────────────────────────────────────
-- Default policies suit an internal team tool: every signed-in user can read
-- the board, file reports as themselves (or anonymously), triage, and delete.
-- The UI additionally gates triage/delete behind the provider's canTriage /
-- canDelete props — but that is a UX affordance, not security. To ENFORCE
-- triage roles at the database, replace the update/delete policies with a
-- role check, e.g. Balance's:
--
--   create policy "feedback_items_update"
--     on public.feedback_items for update to authenticated
--     using (public.is_admin_or_supervisor())
--     with check (public.is_admin_or_supervisor());
--
-- where is_admin_or_supervisor() is your app's own role function.
alter table public.feedback_items enable row level security;

drop policy if exists "feedback_items_select" on public.feedback_items;
create policy "feedback_items_select"
  on public.feedback_items for select to authenticated
  using (true);

drop policy if exists "feedback_items_insert" on public.feedback_items;
create policy "feedback_items_insert"
  on public.feedback_items for insert to authenticated
  with check (submitted_by = auth.uid() or submitted_by is null);

drop policy if exists "feedback_items_update" on public.feedback_items;
create policy "feedback_items_update"
  on public.feedback_items for update to authenticated
  using (true)
  with check (true);

drop policy if exists "feedback_items_delete" on public.feedback_items;
create policy "feedback_items_delete"
  on public.feedback_items for delete to authenticated
  using (true);

-- ─── Realtime ──────────────────────────────────────────────────────────────
-- Idempotent add (ALTER PUBLICATION ... ADD errors if the table is already a
-- member, so guard it).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'feedback_items'
  ) then
    alter publication supabase_realtime add table public.feedback_items;
  end if;
end;
$$;
