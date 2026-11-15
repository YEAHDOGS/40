-- Memory backup: the text of a person's imported memories (posts and notes from other networks), opted in
-- from the Memories tab. Never photos or videos. Each row is one gzip-compressed JSON chunk (base64), usually one
-- month of posts, so a whole archive takes a few dozen rows and a re-import rewrites only the chunks that
-- changed. At most 100 rows per person (api/lib/memories.js). Kept through the 40-day wipe; deleted with
-- the account.
create table "memory_chunk" (
  "userId" text not null references "user" ("id") on delete cascade,
  "chunk" text not null,
  "hash" text not null,
  "count" integer not null,
  "bytes" integer not null,
  "data" text not null,
  "updatedAt" integer not null,
  primary key ("userId", "chunk")
);
