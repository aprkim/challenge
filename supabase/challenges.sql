-- Admin config. One row per challenge; edit and re-run to change one.
-- To launch the next one, copy the insert, change slug/dates/title, run it, and
-- /exercise will redirect there once its start date arrives.

insert into public.challenges
  (category, slug, community_label, title, start_date, end_date, bonus_date, goal, weekly_target)
values
  ('exercise', '03', '오늘도 했다', '연말 6주 챌린지', '2026-11-20', '2026-12-31', '2027-01-01', 24, 4)
on conflict (category, slug) do update set
  community_label = excluded.community_label,
  title           = excluded.title,
  start_date      = excluded.start_date,
  end_date        = excluded.end_date,
  bonus_date      = excluded.bonus_date,
  goal            = excluded.goal,
  weekly_target   = excluded.weekly_target;
