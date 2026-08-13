-- Fundación del agendamiento público. La migración es aditiva y todas las capacidades
-- permanecen deshabilitadas hasta que una organización se active explícitamente.

CREATE TABLE public.organization_public_profiles (
  organization_id uuid PRIMARY KEY
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug text NOT NULL,
  display_name text NOT NULL,
  time_zone text NOT NULL DEFAULT 'America/Bogota',
  public_profile_enabled boolean NOT NULL DEFAULT false,
  public_catalog_enabled boolean NOT NULL DEFAULT false,
  public_booking_enabled boolean NOT NULL DEFAULT false,
  public_self_service_enabled boolean NOT NULL DEFAULT false,
  public_chat_enabled boolean NOT NULL DEFAULT false,
  reminders_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_public_profiles_slug_check
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 3 AND 80),
  CONSTRAINT organization_public_profiles_display_name_check
    CHECK (length(btrim(display_name)) BETWEEN 1 AND 120),
  CONSTRAINT organization_public_profiles_time_zone_check
    CHECK (length(btrim(time_zone)) BETWEEN 1 AND 100)
);

CREATE UNIQUE INDEX organization_public_profiles_slug_uidx
  ON public.organization_public_profiles (slug);

ALTER TABLE public.organization_public_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_public_profiles FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organization_public_profiles FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.organization_public_profiles TO service_role;

CREATE OR REPLACE FUNCTION private.create_organization_public_profile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  slug_base text;
BEGIN
  slug_base := trim(BOTH '-' FROM regexp_replace(lower(NEW.name), '[^a-z0-9]+', '-', 'g'));
  IF slug_base = '' THEN
    slug_base := 'barberia';
  END IF;

  INSERT INTO public.organization_public_profiles (
    organization_id,
    slug,
    display_name
  ) VALUES (
    NEW.id,
    left(slug_base, 40) || '-' || NEW.id::text,
    left(COALESCE(NULLIF(btrim(NEW.name), ''), 'Barberia'), 120)
  )
  ON CONFLICT (organization_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.create_organization_public_profile()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.touch_organization_public_profile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.touch_organization_public_profile()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS organizations_create_public_profile ON public.organizations;
CREATE TRIGGER organizations_create_public_profile
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION private.create_organization_public_profile();

DROP TRIGGER IF EXISTS organization_public_profiles_touch_updated_at
  ON public.organization_public_profiles;
CREATE TRIGGER organization_public_profiles_touch_updated_at
BEFORE UPDATE ON public.organization_public_profiles
FOR EACH ROW
EXECUTE FUNCTION private.touch_organization_public_profile();

INSERT INTO public.organization_public_profiles (
  organization_id,
  slug,
  display_name
)
SELECT
  organization.id,
  left(
    COALESCE(
      NULLIF(trim(BOTH '-' FROM regexp_replace(lower(organization.name), '[^a-z0-9]+', '-', 'g')), ''),
      'barberia'
    ),
    40
  ) || '-' || organization.id::text,
  left(COALESCE(NULLIF(btrim(organization.name), ''), 'Barberia'), 120)
FROM public.organizations AS organization
ON CONFLICT (organization_id) DO NOTHING;
