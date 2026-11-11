-- 40: habits, daily records, the public feed, and the 40-day cycle. Created by DOGS.

-- Per-user settings. "region" is optional and only used for local comparisons (e.g. "US-GA").
create table "profile" (
	"userId" text not null primary key references "user" ("id") on delete cascade,
	"region" text
);

-- Anything a person tracks. kind: 'quit' (a vice, less is better) or 'build' (a good habit, more is better).
-- visibility: 'private' (owner only, never in comparisons), 'friends' (mutual follows), 'public'.
-- "key" is the normalized name; people with the same key are compared with each other.
create table "habit" (
	"id" text not null primary key,
	"userId" text not null references "user" ("id") on delete cascade,
	"name" text not null,
	"key" text not null,
	"kind" text not null check ("kind" in ('quit', 'build')),
	"visibility" text not null default 'private' check ("visibility" in ('private', 'friends', 'public')),
	"createdAt" integer not null
);
create index "habit_userId_idx" on "habit" ("userId");
create index "habit_key_idx" on "habit" ("key");

-- One row per habit per tracked day. "day" is the user's local date, YYYY-MM-DD. done: 1 = did it, 0 = did not.
-- No row = that day was not tracked. These records are private history and are NEVER wiped by the cycle.
create table "habit_log" (
	"habitId" text not null references "habit" ("id") on delete cascade,
	"userId" text not null references "user" ("id") on delete cascade,
	"day" text not null,
	"done" integer not null,
	primary key ("habitId", "day")
);
create index "habit_log_user_day_idx" on "habit_log" ("userId", "day");

-- One-way follows. Two people who follow each other are friends.
create table "follow" (
	"followerId" text not null references "user" ("id") on delete cascade,
	"followeeId" text not null references "user" ("id") on delete cascade,
	"createdAt" integer not null,
	primary key ("followerId", "followeeId")
);
create index "follow_followee_idx" on "follow" ("followeeId");

-- Public content. Everything in "post" and "comment" is deleted when the cycle ends.
-- kind: 'text' (written by the user) or 'record' (a streak or week summary composed by the server).
create table "post" (
	"id" text not null primary key,
	"userId" text not null references "user" ("id") on delete cascade,
	"kind" text not null default 'text',
	"body" text not null,
	"createdAt" integer not null
);
create index "post_createdAt_idx" on "post" ("createdAt");

create table "comment" (
	"id" text not null primary key,
	"postId" text not null references "post" ("id") on delete cascade,
	"userId" text not null references "user" ("id") on delete cascade,
	"body" text not null,
	"createdAt" integer not null
);
create index "comment_postId_idx" on "comment" ("postId", "createdAt");

-- The single 40-day cycle (times in unix ms). The first one starts when this migration runs.
create table "cycle" (
	"id" integer not null primary key check ("id" = 1),
	"startedAt" integer not null,
	"endsAt" integer not null
);
insert into "cycle" ("id", "startedAt", "endsAt")
values (1, unixepoch() * 1000, (unixepoch() + 40 * 86400) * 1000);
