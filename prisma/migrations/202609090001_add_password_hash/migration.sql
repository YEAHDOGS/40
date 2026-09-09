-- Add passwordHash for scrypt-hashed credentials (see src/server/password.js).
-- Nullable so pre-existing rows survive the migration; the REST login
-- endpoint fails closed (401) for users with no hash set.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
