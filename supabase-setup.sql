-- Miracle — one-time Supabase setup
-- Run this once in Supabase Studio -> SQL Editor, then copy the project URL
-- and the `anon` key (Settings -> API) into Miracle -> More -> Cloud sync.
--
-- Email sign-in uses magic links. Enable them under
-- Authentication -> Providers -> Email ("Enable Email provider" on,
-- "Confirm email" on). No passwords are stored by this app.

-- 1. Archive metadata: one row per user, holding categories/bundles/settings.
--    Photo bytes live in Storage, not here.
create table if not exists public.archive (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.archive enable row level security;

drop policy if exists "archive: read own" on public.archive;
create policy "archive: read own" on public.archive
  for select using (auth.uid() = user_id);

drop policy if exists "archive: write own" on public.archive;
create policy "archive: write own" on public.archive
  for insert with check (auth.uid() = user_id);

drop policy if exists "archive: update own" on public.archive;
create policy "archive: update own" on public.archive
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. Private bucket for the photo bytes. Paths are "<user id>/<bundle>/<photo>.jpg".
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- Owners can only touch objects inside their own folder.
drop policy if exists "photos: read own" on storage.objects;
create policy "photos: read own" on storage.objects
  for select using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "photos: insert own" on storage.objects;
create policy "photos: insert own" on storage.objects
  for insert with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "photos: update own" on storage.objects;
create policy "photos: update own" on storage.objects
  for update using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "photos: delete own" on storage.objects;
create policy "photos: delete own" on storage.objects
  for delete using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. Sanity check (should return 1 row for the bucket and 5 policies):
-- select id, public from storage.buckets where id = 'photos';
-- select tablename, policyname from pg_policies
--   where schemaname in ('public','storage') and policyname like '%own';
