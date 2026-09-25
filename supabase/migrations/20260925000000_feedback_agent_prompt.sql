-- ─────────────────────────────────────────────────────────────────────────────
-- DE-bug — agent_prompt: flag a report as a prompt for a coding agent.
--
-- A reporter the host app trusts can tick "🤖 Send to an agent as a prompt".
-- The flag is the ONLY thing an agent watcher should act on (see README →
-- "Agent watch"); the report's text is user input either way.
--
-- Who may set the flag is your app's decision. In the UI it is the provider's
-- `canFlagForAgent` prop (default false) — a UX gate. This migration adds the
-- database-side gate: a BEFORE trigger that drops the flag whenever
-- public.feedback_can_flag_for_agent() says no, so a crafted request can't set
-- it. The function ships returning true (the kit's permissive default, like its
-- RLS); replace it with your own role check, e.g.
--
--   create or replace function public.feedback_can_flag_for_agent()
--   returns boolean language sql stable as $$ select public.is_admin() $$;
--
-- A re-run of this file never overwrites a version you have replaced.
-- Idempotent where practical.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.feedback_items
  add column if not exists agent_prompt boolean not null default false;

comment on column public.feedback_items.agent_prompt is
  'Flagged by a trusted reporter as a prompt for a coding agent. Report text stays untrusted input.';

-- What an agent watcher polls: open reports that are flagged.
create index if not exists feedback_items_agent_prompt_idx
  on public.feedback_items (created_at)
  where agent_prompt;

-- ─── Who may flag: your app's hook (created once, never overwritten) ────────
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'feedback_can_flag_for_agent'
  ) then
    execute $f$
      create function public.feedback_can_flag_for_agent()
      returns boolean
      language sql
      stable
      as $body$ select true $body$
    $f$;
  end if;
end;
$$;

-- ─── The gate: an untrusted flag is dropped, never an error ─────────────────
-- Dropping (rather than refusing) keeps the report itself: an untrusted user's
-- bug still lands on the board, just not as an agent task. Clearing a flag is
-- always allowed.
create or replace function public.feedback_items_guard_agent_prompt()
returns trigger
language plpgsql
as $$
begin
  if new.agent_prompt
     and (tg_op = 'INSERT' or not coalesce(old.agent_prompt, false))
     and not coalesce(public.feedback_can_flag_for_agent(), false) then
    new.agent_prompt := false;
  end if;
  return new;
end;
$$;

drop trigger if exists feedback_items_guard_agent_prompt on public.feedback_items;
create trigger feedback_items_guard_agent_prompt
  before insert or update of agent_prompt on public.feedback_items
  for each row execute function public.feedback_items_guard_agent_prompt();
