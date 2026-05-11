create extension if not exists pgcrypto;

alter table public.images enable row level security;
alter table public.sessions enable row level security;
alter table public.session_images enable row level security;
alter table storage.objects enable row level security;

grant usage on schema public to anon, authenticated;
grant usage on schema storage to anon, authenticated;

grant select, insert, update, delete on public.images to anon, authenticated;
grant select, insert, update, delete on public.sessions to anon, authenticated;
grant select, insert, update, delete on public.session_images to anon, authenticated;

drop policy if exists "Public full access images" on public.images;
drop policy if exists "Public full access sessions" on public.sessions;
drop policy if exists "Public full access session_images" on public.session_images;

create policy "Public full access images"
  on public.images
  for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "Public full access sessions"
  on public.sessions
  for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "Public full access session_images"
  on public.session_images
  for all
  to anon, authenticated
  using (true)
  with check (true);

insert into storage.buckets (id, name, public)
values ('report-images', 'report-images', true)
on conflict (id)
do update set public = true;

drop policy if exists "Public read report-images" on storage.objects;
drop policy if exists "Public insert report-images" on storage.objects;
drop policy if exists "Public update report-images" on storage.objects;
drop policy if exists "Public delete report-images" on storage.objects;

create policy "Public read report-images"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'report-images');

create policy "Public insert report-images"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'report-images');

create policy "Public update report-images"
  on storage.objects
  for update
  to anon, authenticated
  using (bucket_id = 'report-images')
  with check (bucket_id = 'report-images');

create policy "Public delete report-images"
  on storage.objects
  for delete
  to anon, authenticated
  using (bucket_id = 'report-images');
