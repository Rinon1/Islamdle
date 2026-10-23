-- Islamdle — Supabase setup. Run once in Supabase → SQL Editor → New query.
--
-- One table: the days a signed-in player solved something, so their streak
-- follows them between devices. Row-level security means each player can
-- only ever read or write their own rows, even though the anon key is public.
-- Donations are NOT stored here; they live in Netlify Blobs (see netlify/).

create table if not exists public.played_days (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  n          integer     not null check (n > 0),   -- puzzle number, 1 = 1 Jan 2026
  created_at timestamptz not null default now(),
  primary key (user_id, n)
);

alter table public.played_days enable row level security;

drop policy if exists "read own days" on public.played_days;
create policy "read own days" on public.played_days
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "add own days" on public.played_days;
create policy "add own days" on public.played_days
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "delete own days" on public.played_days;
create policy "delete own days" on public.played_days
  for delete to authenticated using ((select auth.uid()) = user_id);
