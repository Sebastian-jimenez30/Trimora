-- Etapa 02 del agendamiento publico: configuracion y disponibilidad.
-- Todas las estructuras son aditivas, privadas y no habilitan reservas publicas.

CREATE TABLE public.public_booking_settings (
  organization_id uuid PRIMARY KEY
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  minimum_notice_minutes integer NOT NULL DEFAULT 60,
  maximum_advance_days integer NOT NULL DEFAULT 60,
  slot_interval_minutes integer NOT NULL DEFAULT 15,
  buffer_minutes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_booking_settings_notice_check
    CHECK (minimum_notice_minutes BETWEEN 0 AND 43200),
  CONSTRAINT public_booking_settings_horizon_check
    CHECK (maximum_advance_days BETWEEN 1 AND 730),
  CONSTRAINT public_booking_settings_interval_check
    CHECK (slot_interval_minutes BETWEEN 5 AND 240),
  CONSTRAINT public_booking_settings_buffer_check
    CHECK (buffer_minutes BETWEEN 0 AND 240)
);

CREATE TABLE public.staff_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL
    REFERENCES public.organization_members(id) ON DELETE CASCADE,
  service_id uuid NOT NULL
    REFERENCES public.services(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_services_org_staff_fk
    FOREIGN KEY (organization_id, staff_id)
    REFERENCES public.organization_members(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT staff_services_org_service_fk
    FOREIGN KEY (organization_id, service_id)
    REFERENCES public.services(organization_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX staff_services_org_staff_service_uidx
  ON public.staff_services(organization_id, staff_id, service_id);
CREATE INDEX staff_services_org_service_staff_idx
  ON public.staff_services(organization_id, service_id, staff_id);

CREATE TABLE public.availability_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid
    REFERENCES public.organization_members(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL,
  start_minute integer NOT NULL,
  end_minute integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_windows_day_check CHECK (day_of_week BETWEEN 1 AND 7),
  CONSTRAINT availability_windows_start_check CHECK (start_minute BETWEEN 0 AND 1439),
  CONSTRAINT availability_windows_end_check CHECK (end_minute BETWEEN 0 AND 1439),
  CONSTRAINT availability_windows_period_check CHECK (start_minute <> end_minute),
  CONSTRAINT availability_windows_org_staff_fk
    FOREIGN KEY (organization_id, staff_id)
    REFERENCES public.organization_members(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX availability_windows_org_staff_day_idx
  ON public.availability_windows(organization_id, staff_id, day_of_week);
CREATE UNIQUE INDEX availability_windows_scope_period_uidx
  ON public.availability_windows(
    organization_id,
    COALESCE(staff_id, '00000000-0000-0000-0000-000000000000'::uuid),
    day_of_week,
    start_minute,
    end_minute
  );

CREATE TABLE public.availability_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid
    REFERENCES public.organization_members(id) ON DELETE CASCADE,
  kind text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_blocks_kind_check
    CHECK (kind IN ('CLOSED', 'BREAK', 'ABSENCE')),
  CONSTRAINT availability_blocks_period_check CHECK (ends_at > starts_at),
  CONSTRAINT availability_blocks_notes_check
    CHECK (notes IS NULL OR length(notes) <= 500),
  CONSTRAINT availability_blocks_org_staff_fk
    FOREIGN KEY (organization_id, staff_id)
    REFERENCES public.organization_members(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX availability_blocks_org_starts_ends_idx
  ON public.availability_blocks(organization_id, starts_at, ends_at);
CREATE INDEX availability_blocks_org_staff_starts_idx
  ON public.availability_blocks(organization_id, staff_id, starts_at);

ALTER TABLE public.public_booking_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_booking_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_services FORCE ROW LEVEL SECURITY;
ALTER TABLE public.availability_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_windows FORCE ROW LEVEL SECURITY;
ALTER TABLE public.availability_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_blocks FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.public_booking_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.staff_services FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.availability_windows FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.availability_blocks FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.public_booking_settings TO service_role;
GRANT ALL ON TABLE public.staff_services TO service_role;
GRANT ALL ON TABLE public.availability_windows TO service_role;
GRANT ALL ON TABLE public.availability_blocks TO service_role;

CREATE OR REPLACE FUNCTION private.create_public_booking_settings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.public_booking_settings (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.touch_public_booking_settings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.create_public_booking_settings()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.touch_public_booking_settings()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER organizations_create_public_booking_settings
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION private.create_public_booking_settings();

CREATE TRIGGER public_booking_settings_touch_updated_at
BEFORE UPDATE ON public.public_booking_settings
FOR EACH ROW
EXECUTE FUNCTION private.touch_public_booking_settings();

INSERT INTO public.public_booking_settings (organization_id)
SELECT organization.id
FROM public.organizations AS organization
ON CONFLICT (organization_id) DO NOTHING;
