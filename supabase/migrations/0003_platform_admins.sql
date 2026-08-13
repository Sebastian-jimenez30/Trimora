CREATE TABLE IF NOT EXISTS "platform_admins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL UNIQUE,
  "granted_by" uuid,
  "reason" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "revoked_at" timestamptz
);

INSERT INTO "platform_admins" ("user_id", "granted_by", "reason")
SELECT "id", "id", 'Migración de autorización global heredada'
FROM auth.users
WHERE lower(email) = 'trimoraerp@gmail.com'
ON CONFLICT ("user_id") DO NOTHING;
