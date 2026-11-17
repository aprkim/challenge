-- Challenge check-in app schema (Supabase / Postgres).
-- Run once in the Supabase SQL editor. Safe to re-run.
-- There is no login: the browser talks to PostgREST as the `anon` role,
-- so every rule that matters is enforced here with grants, constraints and RLS.

create extension if not exists pgcrypto;

-- One row per challenge. This is the admin config: add a row to launch /exercise/04.
create table if not exists public.challenges (
  id              uuid primary key default gen_random_uuid(),
  category        text not null,                 -- URL segment, e.g. 'exercise'
  slug            text not null,                 -- URL segment, e.g. '03'
  community_label text not null,
  title           text not null,
  start_date      date not null,
  end_date        date not null,
  bonus_date      date,                          -- optional extra day after end_date
  goal            int  not null check (goal > 0),
  weekly_target   int  not null check (weekly_target > 0),
  created_at      timestamptz not null default now(),
  unique (category, slug),
  check (end_date >= start_date),
  check (bonus_date is null or bonus_date > end_date)
);

create table if not exists public.participants (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  name         text not null check (name = btrim(name) and char_length(name) between 1 and 20),
  created_at   timestamptz not null default now()
);
-- Unique per challenge, ignoring case ("april" and "April" are the same person).
create unique index if not exists participants_challenge_name_key
  on public.participants (challenge_id, lower(name));

create table if not exists public.checkins (
  participant_id uuid not null references public.participants (id) on delete cascade,
  date           date not null,
  created_at     timestamptz not null default now(),
  primary key (participant_id, date)
);

-- Privileges: read everything; create participants; add and remove check-ins. No updates.
revoke all on public.challenges, public.participants, public.checkins from anon, authenticated;
grant select on public.challenges, public.participants, public.checkins to anon, authenticated;
grant insert (challenge_id, name) on public.participants to anon, authenticated;
grant insert (participant_id, date), delete on public.checkins to anon, authenticated;

alter table public.challenges   enable row level security;
alter table public.participants enable row level security;
alter table public.checkins     enable row level security;

drop policy if exists "read challenges"   on public.challenges;
drop policy if exists "read participants" on public.participants;
drop policy if exists "join challenge"    on public.participants;
drop policy if exists "read checkins"     on public.checkins;
drop policy if exists "add checkin"       on public.checkins;
drop policy if exists "remove checkin"    on public.checkins;

create policy "read challenges"   on public.challenges   for select using (true);
create policy "read participants" on public.participants for select using (true);
create policy "join challenge"    on public.participants for insert with check (true);
create policy "read checkins"     on public.checkins     for select using (true);
create policy "remove checkin"    on public.checkins     for delete using (true);

-- A check-in must fall inside the challenge (start..end, or the bonus day) and must not be
-- in the future anywhere on Earth. "Today" is decided by the viewer's local date, and
-- UTC+14 is the furthest-ahead time zone, so that is the server-side ceiling.
create policy "add checkin" on public.checkins for insert with check (
  date <= (now() at time zone 'Etc/GMT-14')::date
  and exists (
    select 1
    from public.participants p
    join public.challenges c on c.id = p.challenge_id
    where p.id = participant_id
      and (date between c.start_date and c.end_date or date = c.bonus_date)
  )
);
