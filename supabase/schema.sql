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
               ('demicercle','cameleon','imposteur','loup','classement','quiaecrit','crousprison','bots','soiree','emoji')),
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

-- =====================================================================
-- Amis et invitations dans une salle (ajout du lot 9, relançable sans risque)
-- =====================================================================
create table if not exists public.friendships (
  user_id    uuid not null references public.profiles(id) on delete cascade,   -- qui a demandé
  friend_id  uuid not null references public.profiles(id) on delete cascade,   -- qui reçoit la demande
  status     text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
create index if not exists friendships_friend_idx on public.friendships (friend_id);

create table if not exists public.room_invites (
  id         bigint generated always as identity primary key,
  from_id    uuid not null references public.profiles(id) on delete cascade,
  from_name  text not null,
  to_id      uuid not null references public.profiles(id) on delete cascade,
  route      text not null check (route in ('demicercle','cameleon','imposteur','loup','classement','quiaecrit','crousprison','bots','soiree','emoji')),
  code       text not null check (code ~ '^[A-Z0-9-]{3,20}$'),
  created_at timestamptz not null default now()
);
create index if not exists room_invites_to_idx on public.room_invites (to_id, created_at desc);

alter table public.friendships  enable row level security;
alter table public.room_invites enable row level security;
drop policy if exists "mes amitiés" on public.friendships;
create policy "mes amitiés" on public.friendships for select to authenticated
  using ((select auth.uid()) in (user_id, friend_id));
drop policy if exists "mes invitations" on public.room_invites;
create policy "mes invitations" on public.room_invites for select to authenticated
  using ((select auth.uid()) in (from_id, to_id));
revoke all on public.friendships, public.room_invites from anon, authenticated;
grant  select on public.friendships, public.room_invites to authenticated;

-- demande d'ami par pseudo de connexion ; si l'autre m'avait déjà demandé, on devient amis
create or replace function public.send_friend_request(p_username text)
returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); other uuid;
begin
  if uid is null then raise exception 'non connecté'; end if;
  select id into other from public.profiles where username = lower(trim(p_username));
  if other is null then return 'introuvable'; end if;
  if other = uid then return 'soi'; end if;
  if exists (select 1 from public.friendships where user_id = uid and friend_id = other)
     or exists (select 1 from public.friendships where user_id = other and friend_id = uid and status = 'accepted') then
    return 'deja';
  end if;
  if exists (select 1 from public.friendships where user_id = other and friend_id = uid and status = 'pending') then
    update public.friendships set status = 'accepted' where user_id = other and friend_id = uid;
    return 'accepte';
  end if;
  if (select count(*) from public.friendships where user_id = uid and status = 'pending') >= 50 then return 'trop'; end if;
  insert into public.friendships (user_id, friend_id) values (uid, other);
  return 'envoye';
end $$;

create or replace function public.respond_friend_request(p_from uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'non connecté'; end if;
  if p_accept then
    update public.friendships set status = 'accepted' where user_id = p_from and friend_id = uid and status = 'pending';
  else
    delete from public.friendships where user_id = p_from and friend_id = uid and status = 'pending';
  end if;
end $$;

-- retire un ami, ou annule une demande envoyée
create or replace function public.remove_friend(p_other uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'non connecté'; end if;
  delete from public.friendships where (user_id = uid and friend_id = p_other) or (user_id = p_other and friend_id = uid);
end $$;

-- mes amis et demandes, avec un résumé de leurs stats
create or replace function public.my_friends()
returns table (id uuid, username text, display_name text, status text, incoming boolean,
               played bigint, wins bigint, last_played timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, f.status, (f.friend_id = auth.uid()) as incoming,
         coalesce((select sum(s.played) from public.stats s where s.user_id = p.id), 0)::bigint,
         coalesce((select sum(s.wins)   from public.stats s where s.user_id = p.id), 0)::bigint,
         (select max(s.updated_at) from public.stats s where s.user_id = p.id)
  from public.friendships f
  join public.profiles p on p.id = case when f.user_id = auth.uid() then f.friend_id else f.user_id end
  where auth.uid() in (f.user_id, f.friend_id)
  order by f.status desc, p.display_name;
$$;

-- invitation d'un ami dans ma salle (seulement entre amis)
create or replace function public.invite_friend(p_friend uuid, p_route text, p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); me text;
begin
  if uid is null then raise exception 'non connecté'; end if;
  if not exists (select 1 from public.friendships
                 where status = 'accepted' and ((user_id = uid and friend_id = p_friend) or (user_id = p_friend and friend_id = uid))) then
    raise exception 'pas ami';
  end if;
  -- anti-spam : une invitation toutes les 10 secondes par ami
  if exists (select 1 from public.room_invites where from_id = uid and to_id = p_friend and created_at > now() - interval '10 seconds') then return; end if;
  delete from public.room_invites where created_at < now() - interval '1 hour';
  select display_name into me from public.profiles where id = uid;
  insert into public.room_invites (from_id, from_name, to_id, route, code) values (uid, me, p_friend, p_route, upper(p_code));
end $$;

create or replace function public.dismiss_invite(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  delete from public.room_invites where id = p_id and to_id = auth.uid();
end $$;

revoke execute on function public.send_friend_request(text) from public, anon;
grant  execute on function public.send_friend_request(text) to authenticated;
revoke execute on function public.respond_friend_request(uuid, boolean) from public, anon;
grant  execute on function public.respond_friend_request(uuid, boolean) to authenticated;
revoke execute on function public.remove_friend(uuid) from public, anon;
grant  execute on function public.remove_friend(uuid) to authenticated;
revoke execute on function public.my_friends() from public, anon;
grant  execute on function public.my_friends() to authenticated;
revoke execute on function public.invite_friend(uuid, text, text) from public, anon;
grant  execute on function public.invite_friend(uuid, text, text) to authenticated;
revoke execute on function public.dismiss_invite(bigint) from public, anon;
grant  execute on function public.dismiss_invite(bigint) to authenticated;

-- =====================================================================
-- Notifications push des invitations (relançable sans risque)
-- Un abonnement par appareil ; l'envoi se fait par la fonction Edge « invite-push »
-- (supabase/functions/invite-push), qui lit cette table avec la clé service.
-- =====================================================================
create table if not exists public.push_subscriptions (
  endpoint   text primary key check (char_length(endpoint) between 10 and 1000),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  p256dh     text not null check (char_length(p256dh) < 200),
  auth       text not null check (char_length(auth) < 100),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
-- aucune politique : personne ne lit ni n'écrit directement (fonctions ci-dessous + clé service)
revoke all on public.push_subscriptions from anon, authenticated;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'non connecté'; end if;
  if p_endpoint !~ '^https://' then raise exception 'adresse invalide'; end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values (p_endpoint, uid, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
  -- au plus 10 appareils par compte
  delete from public.push_subscriptions where endpoint in (
    select endpoint from public.push_subscriptions where user_id = uid order by created_at desc offset 10);
end $$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end $$;

revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant  execute on function public.save_push_subscription(text, text, text) to authenticated;
revoke execute on function public.delete_push_subscription(text) from public, anon;
grant  execute on function public.delete_push_subscription(text) to authenticated;

-- =====================================================================
-- Succès (relançable sans risque) : lisibles par tous (comme les stats), écrits par la fonction
-- =====================================================================
create table if not exists public.achievements (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  key         text not null check (key ~ '^[a-z0-9_]{2,30}$'),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.achievements enable row level security;
drop policy if exists "succès lisibles" on public.achievements;
create policy "succès lisibles" on public.achievements for select using (true);
revoke all on public.achievements from anon, authenticated;
grant  select on public.achievements to anon, authenticated;

create or replace function public.unlock_achievement(p_key text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  if p_key !~ '^[a-z0-9_]{2,30}$' then raise exception 'clé invalide'; end if;
  if (select count(*) from public.achievements where user_id = auth.uid()) >= 100 then return; end if;
  insert into public.achievements (user_id, key) values (auth.uid(), p_key) on conflict do nothing;
end $$;
revoke execute on function public.unlock_achievement(text) from public, anon;
grant  execute on function public.unlock_achievement(text) to authenticated;

-- =====================================================================
-- Emoji Quiz : ajouter le jeu aux listes autorisées (relançable sans risque)
-- =====================================================================
alter table public.stats drop constraint if exists stats_game_check;
alter table public.stats add constraint stats_game_check check (game in
  ('demicercle','cameleon','imposteur','loup','classement','quiaecrit','crousprison','bots','soiree','emoji'));
alter table public.room_invites drop constraint if exists room_invites_route_check;
alter table public.room_invites add constraint room_invites_route_check check (route in
  ('demicercle','cameleon','imposteur','loup','classement','quiaecrit','crousprison','bots','soiree','emoji'));
