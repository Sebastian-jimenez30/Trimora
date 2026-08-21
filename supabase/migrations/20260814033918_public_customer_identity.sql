-- Etapa 03 del agendamiento publico: identidad verificada y sesion de cliente.
-- No habilita capacidades publicas por defecto ni modifica datos existentes.

ALTER TABLE public.organization_public_profiles
ADD COLUMN public_identity_enabled boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX clients_org_id_uidx ON public.clients(organization_id, id);

CREATE TABLE public.public_identity_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel text NOT NULL,
  contact_hash varchar(64) NOT NULL,
  ip_hash varchar(64),
  attempt_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_identity_challenges_channel_check
    CHECK (channel IN ('EMAIL', 'PHONE')),
  CONSTRAINT public_identity_challenges_contact_hash_check
    CHECK (contact_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT public_identity_challenges_ip_hash_check
    CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT public_identity_challenges_attempt_count_check
    CHECK (attempt_count BETWEEN 0 AND 5),
  CONSTRAINT public_identity_challenges_expiry_check
    CHECK (expires_at > created_at),
  CONSTRAINT public_identity_challenges_consumed_check
    CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX public_identity_challenges_org_contact_created_idx
  ON public.public_identity_challenges(organization_id, contact_hash, created_at DESC);
CREATE INDEX public_identity_challenges_ip_created_idx
  ON public.public_identity_challenges(ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;

CREATE TABLE public.customer_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL
    REFERENCES public.clients(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL,
  contact_hash varchar(64) NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  last_authenticated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_identities_channel_check
    CHECK (channel IN ('EMAIL', 'PHONE')),
  CONSTRAINT customer_identities_contact_hash_check
    CHECK (contact_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT customer_identities_revoked_check
    CHECK (revoked_at IS NULL OR revoked_at >= verified_at),
  CONSTRAINT customer_identities_org_client_fk
    FOREIGN KEY (organization_id, client_id)
    REFERENCES public.clients(organization_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX customer_identities_active_contact_uidx
  ON public.customer_identities(organization_id, channel, contact_hash)
  WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX customer_identities_active_user_channel_uidx
  ON public.customer_identities(organization_id, auth_user_id, channel)
  WHERE revoked_at IS NULL;
CREATE INDEX customer_identities_org_user_active_idx
  ON public.customer_identities(organization_id, auth_user_id)
  WHERE revoked_at IS NULL;
CREATE INDEX customer_identities_client_idx
  ON public.customer_identities(client_id);

CREATE TABLE public.public_identity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  challenge_id uuid
    REFERENCES public.public_identity_challenges(id) ON DELETE SET NULL,
  identity_id uuid
    REFERENCES public.customer_identities(id) ON DELETE SET NULL,
  auth_user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_identity_events_type_check
    CHECK (event_type IN ('OTP_REQUESTED', 'OTP_VERIFIED', 'SESSION_CLOSED')),
  CONSTRAINT public_identity_events_outcome_check
    CHECK (outcome IN ('ACCEPTED', 'REJECTED', 'RATE_LIMITED', 'EXPIRED', 'CONFLICT'))
);

CREATE INDEX public_identity_events_org_created_idx
  ON public.public_identity_events(organization_id, created_at DESC);
CREATE INDEX public_identity_events_challenge_idx
  ON public.public_identity_events(challenge_id)
  WHERE challenge_id IS NOT NULL;
CREATE INDEX public_identity_events_identity_idx
  ON public.public_identity_events(identity_id)
  WHERE identity_id IS NOT NULL;

ALTER TABLE public.public_identity_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_identity_challenges FORCE ROW LEVEL SECURITY;
ALTER TABLE public.customer_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_identities FORCE ROW LEVEL SECURITY;
ALTER TABLE public.public_identity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_identity_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.public_identity_challenges FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.customer_identities FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.public_identity_events FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.public_identity_challenges TO service_role;
GRANT ALL ON TABLE public.customer_identities TO service_role;
GRANT ALL ON TABLE public.public_identity_events TO service_role;
