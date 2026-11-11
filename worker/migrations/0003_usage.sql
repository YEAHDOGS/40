-- Free-tier guard (worker/limits.js): what this Worker has used per UTC day.
-- Drop this table when the guard is removed.
create table "usage" (
	"day" text not null primary key,
	"requests" integer not null default 0,
	"rowsRead" integer not null default 0,
	"rowsWritten" integer not null default 0,
	"dbBytes" integer not null default 0
);
