create extension if not exists pgcrypto;

create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  mime_type text not null,
  description text default '',
  status text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  current_batch_id uuid
);

create table if not exists public.session_images (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  batch_id uuid not null,
  storage_path text not null,
  mime_type text not null,
  description text default '',
  status text default '',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.sessions
  add column if not exists current_batch_id uuid;

alter table public.session_images
  add column if not exists batch_id uuid;

create index if not exists idx_images_created_at on public.images (created_at);
create index if not exists idx_sessions_updated_at on public.sessions (updated_at desc);
create index if not exists idx_session_images_session_position on public.session_images (session_id, position);
create index if not exists idx_session_images_session_batch_position on public.session_images (session_id, batch_id, position);

insert into storage.buckets (id, name, public)
values ('report-images', 'report-images', false)
on conflict (id) do nothing;
