-- Profiles persist across cycles. "bio" is public. "wipeHabits" is the person's choice of what the
-- global 40-day wipe does to their own habits and tracked days (see api/lib/cycle.js):
-- 'keep' (default), 'records' (delete tracked days), 'all' (delete habits and tracked days).
alter table "profile" add column "bio" text;
alter table "profile" add column "wipeHabits" text not null default 'keep'
  check ("wipeHabits" in ('keep', 'records', 'all'));
