BEGIN;

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider varchar(20) NOT NULL,
  external_event_id varchar(255) NOT NULL,
  payload_hash varchar(64) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PROCESSING',
  failure_code varchar(64),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT webhook_events_provider_check CHECK (provider IN ('TELEGRAM', 'KAPSO')),
  CONSTRAINT webhook_events_status_check CHECK (status IN ('PROCESSING', 'PROCESSED', 'FAILED')),
  CONSTRAINT webhook_events_payload_hash_check CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT webhook_events_processed_state_check CHECK (
    (status = 'PROCESSING' AND processed_at IS NULL AND failure_code IS NULL)
    OR (status = 'PROCESSED' AND processed_at IS NOT NULL AND failure_code IS NULL)
    OR (status = 'FAILED' AND processed_at IS NOT NULL AND failure_code IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_provider_external_uidx
  ON public.webhook_events (provider, external_event_id);
CREATE INDEX IF NOT EXISTS webhook_events_org_received_idx
  ON public.webhook_events (organization_id, received_at);
CREATE INDEX IF NOT EXISTS webhook_events_status_received_idx
  ON public.webhook_events (status, received_at);

CREATE TABLE IF NOT EXISTS public.webhook_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider varchar(20) NOT NULL,
  bucket_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_rate_limits_provider_check CHECK (provider IN ('TELEGRAM', 'KAPSO')),
  CONSTRAINT webhook_rate_limits_count_check CHECK (request_count > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS webhook_rate_limits_org_provider_bucket_uidx
  ON public.webhook_rate_limits (organization_id, provider, bucket_start);
CREATE INDEX IF NOT EXISTS webhook_rate_limits_bucket_idx
  ON public.webhook_rate_limits (bucket_start);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_rate_limits FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.webhook_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.webhook_rate_limits FROM anon, authenticated;

COMMENT ON TABLE public.webhook_events IS
  'Metadatos no sensibles para idempotencia y trazabilidad de webhooks procesados por el servidor.';
COMMENT ON TABLE public.webhook_rate_limits IS
  'Contadores persistentes por minuto para limitar canales externos en despliegues distribuidos.';

COMMIT;
