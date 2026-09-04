create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_interdee_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.admin_users where user_id=auth.uid()) $$;

create table if not exists public.products (
  id text primary key,
  name text not null,
  category text not null default 'autres',
  label text not null default '',
  composition text not null default '',
  price numeric(12,2) not null default 0,
  original numeric(12,2) not null default 0,
  discount_rate numeric(6,4) not null default 0,
  stock integer not null default 0,
  variants jsonb not null default '[]'::jsonb,
  image text not null default '',
  color_images jsonb not null default '{}'::jsonb,
  icon text not null default '✦',
  color text not null default '#b78166',
  description text not null default '',
  visible boolean not null default true,
  display_order integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.products add column if not exists season text not null default 'FW';

create table if not exists public.site_settings (
  id text primary key default 'site',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  public_code text unique not null default ('R' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  created_at timestamptz not null default now(),
  status text not null default 'new' check(status in ('new','confirmed','done','cancelled')),
  customer jsonb not null,
  items jsonb not null,
  total numeric(12,2) not null default 0
);
alter table public.orders add column if not exists total numeric(12,2) not null default 0;

alter table public.admin_users enable row level security;
alter table public.products enable row level security;
alter table public.site_settings enable row level security;
alter table public.orders enable row level security;

drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products for select using (visible or public.is_interdee_admin());
drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products for all using (public.is_interdee_admin()) with check (public.is_interdee_admin());
drop policy if exists products_public_admin_all on public.products;
create policy products_public_admin_all on public.products for all to anon using (true) with check (true);
drop policy if exists settings_public_read on public.site_settings;
create policy settings_public_read on public.site_settings for select using (true);
drop policy if exists settings_admin_write on public.site_settings;
create policy settings_admin_write on public.site_settings for all using (public.is_interdee_admin()) with check (public.is_interdee_admin());
drop policy if exists settings_public_admin_all on public.site_settings;
create policy settings_public_admin_all on public.site_settings for all to anon using (true) with check (true);
drop policy if exists orders_public_insert on public.orders;
create policy orders_public_insert on public.orders for insert to anon, authenticated with check (status='new' and jsonb_typeof(customer)='object' and jsonb_typeof(items)='array');
drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all on public.orders for all using (public.is_interdee_admin()) with check (public.is_interdee_admin());
drop policy if exists orders_public_admin_all on public.orders;
create policy orders_public_admin_all on public.orders for all to anon using (true) with check (true);
drop policy if exists admins_self_read on public.admin_users;
create policy admins_self_read on public.admin_users for select using (user_id=auth.uid());

insert into storage.buckets(id,name,public) values('product-media','product-media',true)
on conflict(id) do update set public=true;
drop policy if exists media_public_read on storage.objects;
create policy media_public_read on storage.objects for select using (bucket_id='product-media');
drop policy if exists media_admin_insert on storage.objects;
create policy media_admin_insert on storage.objects for insert with check (bucket_id='product-media' and public.is_interdee_admin());
drop policy if exists media_public_insert on storage.objects;
create policy media_public_insert on storage.objects for insert to anon with check (bucket_id='product-media');
drop policy if exists media_admin_update on storage.objects;
create policy media_admin_update on storage.objects for update using (bucket_id='product-media' and public.is_interdee_admin());
drop policy if exists media_public_update on storage.objects;
create policy media_public_update on storage.objects for update to anon using (bucket_id='product-media') with check (bucket_id='product-media');
drop policy if exists media_admin_delete on storage.objects;
create policy media_admin_delete on storage.objects for delete using (bucket_id='product-media' and public.is_interdee_admin());
drop policy if exists media_public_delete on storage.objects;
create policy media_public_delete on storage.objects for delete to anon using (bucket_id='product-media');

insert into public.site_settings(id,data) values('site','{}'::jsonb) on conflict(id) do nothing;

-- After creating the administrator in Authentication > Users, run:
-- insert into public.admin_users(user_id) values('ADMIN_USER_UUID');
