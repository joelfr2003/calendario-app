-- ============================================================
-- Esquema para Supabase. Pégalo entero en SQL Editor y ejecútalo.
-- ============================================================

-- PERFILES -----------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- AMISTADES ----------------------------------------------------
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references public.profiles(id) on delete cascade,
  addressee uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
create unique index if not exists friendships_pair
  on public.friendships (least(requester, addressee), greatest(requester, addressee));

-- EVENTOS ------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  color text not null default '#3b82f6',
  -- private: solo tú | busy: amigos ven "Ocupado" | friends: amigos ven todo
  visibility text not null default 'private' check (visibility in ('private','busy','friends')),
  google_event_id text,
  created_at timestamptz not null default now(),
  unique (owner, google_event_id)
);
create index if not exists events_owner_start on public.events (owner, start_at);

-- FUNCIONES AUXILIARES ----------------------------------------
create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester = a and addressee = b) or (requester = b and addressee = a))
  );
$$;

-- Eventos de amigos (aplica privacidad: "busy" oculta título y descripción)
create or replace function public.get_friend_events(
  friend_ids uuid[], range_start timestamptz, range_end timestamptz
)
returns table (
  id uuid, owner uuid, title text, description text,
  start_at timestamptz, end_at timestamptz, all_day boolean,
  color text, visibility text
)
language sql security definer stable set search_path = public as $$
  select e.id, e.owner,
         case when e.visibility = 'busy' then 'Ocupado' else e.title end,
         case when e.visibility = 'busy' then null else e.description end,
         e.start_at, e.end_at, e.all_day, e.color, e.visibility
  from public.events e
  where e.owner = any(friend_ids)
    and e.visibility in ('busy','friends')
    and public.are_friends(e.owner, auth.uid())
    and e.start_at < range_end
    and e.end_at > range_start;
$$;

-- Buscar usuario por email exacto (para enviar solicitudes)
create or replace function public.find_profile_by_email(p_email text)
returns table (id uuid, email text, display_name text)
language sql security definer stable set search_path = public as $$
  select p.id, p.email, p.display_name
  from public.profiles p
  where lower(p.email) = lower(trim(p_email)) and p.id <> auth.uid();
$$;

-- SEGURIDAD (RLS) ---------------------------------------------
alter table public.profiles    enable row level security;
alter table public.friendships enable row level security;
alter table public.events      enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.friendships f
    where auth.uid() in (f.requester, f.addressee)
      and profiles.id in (f.requester, f.addressee)
  )
);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships for select to authenticated
  using (auth.uid() in (requester, addressee));
drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships for insert to authenticated
  with check (requester = auth.uid() and status = 'pending');
drop policy if exists friendships_update on public.friendships;
create policy friendships_update on public.friendships for update to authenticated
  using (addressee = auth.uid()) with check (addressee = auth.uid());
drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships for delete to authenticated
  using (auth.uid() in (requester, addressee));
revoke update on public.friendships from authenticated;
grant update (status) on public.friendships to authenticated;

-- Los eventos solo son accesibles directamente por su dueño.
-- Los amigos los leen vía get_friend_events() (respeta la privacidad).
drop policy if exists events_owner_all on public.events;
create policy events_owner_all on public.events for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
