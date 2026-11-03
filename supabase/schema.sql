-- CRAZY GAMES — comptes joueurs (pseudo + mot de passe) et statistiques.
-- À coller une fois dans Supabase : SQL Editor → New query → Run.
-- Le script peut être relancé sans risque (il ne supprime aucune donnée).
--
-- Connexion : le site transforme le pseudo en adresse interne
-- « pseudo@joueurs.crazygames.app » (jamais utilisée pour envoyer de mail).
-- Il faut donc laisser « Confirm email » désactivé dans Authentication → Providers → Email.

-- ---------- Profils ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 18),
  created_at   timestamptz not null default now()
);

-- ---------- Statistiques par jeu ----------
create table if not exists public.stats (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  game       text not null check (game in
               ('demicercle','cameleon','imposteur','loup','classement','quiaecrit','crousprison','bots','soiree')),
  played     integer not null default 0,
  wins       integer not null default 0,
  best       integer not null default 0,
  total      bigint  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, game)
);
create index if not exists stats_game_best_idx on public.stats (game, best desc);
create index if not exists stats_game_wins_idx on public.stats (game, wins desc);

-- ---------- Droits : tout le monde lit, personne n'écrit directement ----------
alter table public.profiles enable row level security;
alter table public.stats    enable row level security;

drop policy if exists "profils lisibles" on public.profiles;
create policy "profils lisibles" on public.profiles for select using (true);
drop policy if exists "je modifie mon profil" on public.profiles;
create policy "je modifie mon profil" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "stats lisibles" on public.stats;
create policy "stats lisibles" on public.stats for select using (true);

-- (Supabase donne tous les droits par défaut, TRUNCATE compris, qui ignore la RLS : on repart de zéro)
revoke all on public.profiles, public.stats from anon, authenticated;
grant  select on public.profiles, public.stats to anon, authenticated;
grant  update (display_name) on public.profiles to authenticated;

-- ---------- Records : meilleur score et plus de victoires, par jeu (une seule requête pour le site) ----------
create or replace view public.records with (security_invoker = on) as
select g.game,
       b.best, b.user_id as best_user, b.display_name as best_name,
       w.wins, w.user_id as wins_user, w.display_name as wins_name
from (select distinct game from public.stats) g
left join lateral (
  select s.best, s.user_id, p.display_name from public.stats s join public.profiles p on p.id = s.user_id
  where s.game = g.game and s.best > 0 order by s.best desc, s.updated_at asc limit 1) b on true
left join lateral (
  select s.wins, s.user_id, p.display_name from public.stats s join public.profiles p on p.id = s.user_id
  where s.game = g.game and s.wins > 0 order by s.wins desc, s.updated_at asc limit 1) w on true;
grant select on public.records to anon, authenticated;

-- ---------- Création automatique du profil à l'inscription ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  u text := lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  d text := left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), u), 18);
begin
  insert into public.profiles (id, username, display_name) values (new.id, u, d)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- comptes créés avant ce script
insert into public.profiles (id, username, display_name)
select id,
       lower(coalesce(raw_user_meta_data->>'username', split_part(email, '@', 1))),
       left(coalesce(nullif(trim(raw_user_meta_data->>'display_name'), ''), split_part(email, '@', 1)), 18)
from auth.users
where lower(coalesce(raw_user_meta_data->>'username', split_part(email, '@', 1))) ~ '^[a-z0-9_]{3,20}$'
on conflict do nothing;

-- ---------- Enregistrer le résultat d'une partie ----------
create or replace function public.record_result(p_game text, p_score integer, p_won boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'non connecté'; end if;
  if p_score is null or p_score < 0 or p_score > 1000000 then raise exception 'score invalide'; end if;
  insert into public.stats as s (user_id, game, played, wins, best, total)
  values (uid, p_game, 1, case when p_won then 1 else 0 end, p_score, p_score)
  on conflict (user_id, game) do update set
    played     = s.played + 1,
    wins       = s.wins + case when p_won then 1 else 0 end,
    best       = greatest(s.best, p_score),
    total      = s.total + p_score,
    updated_at = now()
  -- anti-spam : une partie toutes les 3 secondes au plus, par jeu
  where s.updated_at < now() - interval '3 seconds';
end $$;

-- ---------- Supprimer son propre compte ----------
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke execute on function public.record_result(text, integer, boolean) from public, anon;
grant  execute on function public.record_result(text, integer, boolean) to authenticated;
revoke execute on function public.delete_my_account() from public, anon;
grant  execute on function public.delete_my_account() to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- =====================================================================
-- Demi-Cercle : meilleures estimations (ajout du lot 5, relançable sans risque)
-- Chaque joueur connecté garde ses 20 meilleures manches en ligne (50 points ou plus).
-- =====================================================================
create table if not exists public.dc_estimates (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('guesser','giver')),
  points      integer not null check (points between 0 and 100),
  theme       text not null check (char_length(theme) between 1 and 30),
  left_label  text not null check (char_length(left_label) between 1 and 20),
  right_label text not null check (char_length(right_label) between 1 and 20),
  clue        text not null check (char_length(clue) between 1 and 60),
  target      numeric(5,1) not null check (target between 0 and 100),
  guess       numeric(5,1) not null check (guess between 0 and 100),
  created_at  timestamptz not null default now()
);
create index if not exists dc_estimates_best_idx on public.dc_estimates (points desc, created_at);
create index if not exists dc_estimates_user_idx on public.dc_estimates (user_id, points desc);

alter table public.dc_estimates enable row level security;
drop policy if exists "estimations lisibles" on public.dc_estimates;
create policy "estimations lisibles" on public.dc_estimates for select using (true);
revoke all on public.dc_estimates from anon, authenticated;
grant  select on public.dc_estimates to anon, authenticated;

-- le top de tout le monde, avec le nom affiché (meilleurs points, puis plus petit écart)
create or replace view public.best_estimates with (security_invoker = on) as
select e.points, e.role, e.theme, e.left_label, e.right_label, e.clue, e.target, e.guess, e.created_at,
       e.user_id, p.display_name
from public.dc_estimates e join public.profiles p on p.id = e.user_id
order by e.points desc, abs(e.target - e.guess) asc, e.created_at asc;
grant select on public.best_estimates to anon, authenticated;

create or replace function public.record_estimate(p_role text, p_points integer, p_theme text, p_left text,
  p_right text, p_clue text, p_target numeric, p_guess numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'non connecté'; end if;
  if p_points is null or p_points < 50 or p_points > 100 then return; end if;
  -- anti-spam : une estimation toutes les 3 secondes au plus
  if exists (select 1 from public.dc_estimates where user_id = uid and created_at > now() - interval '3 seconds') then return; end if;
  insert into public.dc_estimates (user_id, role, points, theme, left_label, right_label, clue, target, guess)
  values (uid, p_role, p_points, left(trim(p_theme), 30), left(trim(p_left), 20), left(trim(p_right), 20),
          left(trim(p_clue), 60), round(p_target, 1), round(p_guess, 1));
  -- on ne garde que les 20 meilleures du joueur
  delete from public.dc_estimates where id in (
    select id from public.dc_estimates where user_id = uid
    order by points desc, abs(target - guess) asc, created_at asc offset 20);
end $$;

revoke execute on function public.record_estimate(text, integer, text, text, text, text, numeric, numeric) from public, anon;
grant  execute on function public.record_estimate(text, integer, text, text, text, text, numeric, numeric) to authenticated;
