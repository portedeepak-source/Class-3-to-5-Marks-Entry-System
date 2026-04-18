-- Recommended schema constraints for reliable user upload

alter table if exists public.users
  add column if not exists auth_id uuid unique;

alter table if exists public.users
  add column if not exists role text check (role in ('admin', 'teacher'));

create unique index if not exists users_email_key on public.users (lower(email));

-- Example RLS for users table
alter table if exists public.users enable row level security;

create policy if not exists "Users can view own profile"
  on public.users
  for select
  using (auth.uid() = auth_id);

create policy if not exists "Admins can manage users"
  on public.users
  for all
  using (
    exists (
      select 1 from public.users u
      where u.auth_id = auth.uid() and u.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.auth_id = auth.uid() and u.role = 'admin'
    )
  );
