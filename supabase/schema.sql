-- ============================================================
-- Options Strategy Trainer — leaderboard schema (Supabase / Postgres)
-- Paste this whole file into the Supabase SQL Editor and Run.
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE throughout.
--
-- Model:
--   * scores        — one row per (game, category, player). category is
--                     'overall' (best score any accuracy) or 'perfect'
--                     (best score from a 100%-accuracy run).
--   * players       — nickname claim ledger (unique name <-> browser token).
--   * submissions_log — timestamps for light rate-limiting.
--   * submit_score()  — the ONLY write path for clients (SECURITY DEFINER).
--                       RLS blocks direct writes; anon may only SELECT + EXECUTE.
-- Admin (you) manages boards from the dashboard with the service_role:
--   delete from scores where game = 'option-value';   -- clear one game
--   delete from scores where id = '...';               -- delete one row
--   truncate scores;                                   -- clear everything
-- ============================================================

-- ---- tables --------------------------------------------------

create table if not exists players (
  nickname     text primary key,
  owner_token  uuid not null,
  created_at   timestamptz not null default now()
);
-- case-insensitive uniqueness so "Mike" and "mike" can't both be claimed
create unique index if not exists players_nickname_lower_idx
  on players (lower(nickname));
create index if not exists players_token_idx on players (owner_token);

create table if not exists scores (
  id           uuid primary key default gen_random_uuid(),
  game         text not null,
  category     text not null check (category in ('overall','perfect')),
  nickname     text not null,
  owner_token  uuid not null,
  score        int  not null check (score >= 0 and score <= 100000),
  correct      int  not null check (correct >= 0),
  attempted    int  not null check (attempted >= correct),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint scores_game_valid check (game in (
    'box-pricing','option-value','moneyness','breakeven',
    'greeks','greeks-predict','outlook','match','memory'
  )),
  constraint scores_one_row_per_player unique (game, category, owner_token)
);
-- fast board reads: top-N by score within a (game, category)
create index if not exists scores_board_idx
  on scores (game, category, score desc, created_at asc);

create table if not exists submissions_log (
  id           bigint generated always as identity primary key,
  owner_token  uuid not null,
  created_at   timestamptz not null default now()
);
create index if not exists submissions_log_token_time_idx
  on submissions_log (owner_token, created_at desc);

-- ---- row-level security -------------------------------------
-- Anyone may READ the boards. Nobody may write directly; all writes go
-- through submit_score() (SECURITY DEFINER, runs as table owner).

alter table scores  enable row level security;
alter table players enable row level security;
alter table submissions_log enable row level security;

drop policy if exists scores_public_read on scores;
create policy scores_public_read on scores
  for select using (true);

-- players / submissions_log have RLS enabled but NO policies => no anon access.

-- ---- write path: submit_score() -----------------------------

create or replace function submit_score(
  p_game      text,
  p_nickname  text,
  p_token     uuid,
  p_score     int,
  p_correct   int,
  p_attempted int
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner   uuid;
  v_recent  int;
  v_perfect boolean;
begin
  -- validate game
  if p_game not in (
    'box-pricing','option-value','moneyness','breakeven',
    'greeks','greeks-predict','outlook','match','memory'
  ) then
    raise exception 'invalid_game';
  end if;

  -- validate nickname: 2-16 chars, letters/numbers/space/underscore/hyphen
  if p_nickname is null or p_nickname !~ '^[A-Za-z0-9 _-]{2,16}$' then
    raise exception 'invalid_nickname';
  end if;

  -- validate counts + score range
  if p_attempted < 0 or p_correct < 0 or p_correct > p_attempted then
    raise exception 'invalid_counts';
  end if;
  if p_score < 0 or p_score > 100000 then
    raise exception 'invalid_score';
  end if;

  -- light rate limit: <= 30 submissions / minute / token
  select count(*) into v_recent
    from submissions_log
   where owner_token = p_token
     and created_at > now() - interval '1 minute';
  if v_recent >= 30 then
    raise exception 'rate_limited';
  end if;

  -- nickname claim (case-insensitive). first token to use a name owns it.
  select owner_token into v_owner
    from players where lower(nickname) = lower(p_nickname);
  if v_owner is null then
    insert into players (nickname, owner_token) values (p_nickname, p_token);
  elsif v_owner <> p_token then
    raise exception 'name_taken';
  end if;

  v_perfect := (p_attempted > 0 and p_correct = p_attempted);

  -- upsert OVERALL board (keep the max score; keep the winning run's detail)
  insert into scores (game, category, nickname, owner_token, score, correct, attempted)
  values (p_game, 'overall', p_nickname, p_token, p_score, p_correct, p_attempted)
  on conflict (game, category, owner_token) do update set
    score     = greatest(scores.score, excluded.score),
    correct   = case when excluded.score > scores.score then excluded.correct   else scores.correct   end,
    attempted = case when excluded.score > scores.score then excluded.attempted else scores.attempted end,
    nickname  = excluded.nickname,
    updated_at = now();

  -- upsert PERFECT board only for flawless runs
  if v_perfect then
    insert into scores (game, category, nickname, owner_token, score, correct, attempted)
    values (p_game, 'perfect', p_nickname, p_token, p_score, p_correct, p_attempted)
    on conflict (game, category, owner_token) do update set
      score     = greatest(scores.score, excluded.score),
      correct   = case when excluded.score > scores.score then excluded.correct   else scores.correct   end,
      attempted = case when excluded.score > scores.score then excluded.attempted else scores.attempted end,
      nickname  = excluded.nickname,
      updated_at = now();
  end if;

  insert into submissions_log (owner_token) values (p_token);
  return 'ok';
end;
$$;

-- ---- grants --------------------------------------------------
-- anon/authenticated may EXECUTE the function and SELECT boards, nothing else.

revoke all on function submit_score(text, text, uuid, int, int, int) from public;
grant execute on function submit_score(text, text, uuid, int, int, int) to anon, authenticated;
grant select on scores to anon, authenticated;

-- ============================================================
-- Quick self-test (optional; delete afterwards):
--   select submit_score('option-value', 'TestUser',
--     '00000000-0000-0000-0000-000000000001', 150, 15, 15);
--   select * from scores where game = 'option-value';
--   delete from scores where nickname = 'TestUser';
--   delete from players where nickname = 'TestUser';
-- ============================================================
