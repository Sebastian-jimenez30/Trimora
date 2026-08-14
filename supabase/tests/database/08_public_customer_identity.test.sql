BEGIN;

SELECT plan(23);

SELECT ok(
  to_regclass('public.public_identity_challenges') IS NOT NULL,
  'existe la tabla privada de desafios de identidad'
);
SELECT ok(
  to_regclass('public.customer_identities') IS NOT NULL,
  'existe la tabla privada de identidades verificadas'
);
SELECT ok(
  to_regclass('public.public_identity_events') IS NOT NULL,
  'existe la auditoria de identidad sin contactos en claro'
);
SELECT col_default_is(
  'public',
  'organization_public_profiles',
  'public_identity_enabled',
  'false',
  'la identidad publica permanece apagada despues de migrar'
);

SELECT is(
  (
    SELECT indisunique
    FROM pg_index
    WHERE indexrelid = 'public.clients_org_id_uidx'::regclass
  ),
  true,
  'clientes ofrece una clave compuesta segura para relaciones multi-tenant'
);
SELECT ok(
  to_regclass('public.public_identity_challenges_org_contact_created_idx') IS NOT NULL,
  'el rate limit por contacto tiene indice compuesto'
);
SELECT is(
  (
    SELECT indisunique AND indpred IS NOT NULL
    FROM pg_index
    WHERE indexrelid = 'public.customer_identities_active_contact_uidx'::regclass
  ),
  true,
  'una identidad activa por contacto se protege con indice parcial unico'
);

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.public_identity_challenges'::regclass),
  true,
  'los desafios tienen RLS'
);
SELECT is(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.public_identity_challenges'::regclass),
  true,
  'los desafios fuerzan RLS'
);
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.customer_identities'::regclass),
  true,
  'las identidades tienen RLS'
);
SELECT is(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.customer_identities'::regclass),
  true,
  'las identidades fuerzan RLS'
);
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.public_identity_events'::regclass),
  true,
  'la auditoria tiene RLS'
);
SELECT is(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.public_identity_events'::regclass),
  true,
  'la auditoria fuerza RLS'
);

SELECT is(
  has_table_privilege('anon', 'public.public_identity_challenges', 'SELECT')
    OR has_table_privilege('authenticated', 'public.public_identity_challenges', 'SELECT'),
  false,
  'ningun cliente de Data API consulta desafios'
);
SELECT is(
  has_table_privilege('anon', 'public.customer_identities', 'SELECT')
    OR has_table_privilege('authenticated', 'public.customer_identities', 'SELECT'),
  false,
  'ningun cliente de Data API consulta identidades'
);
SELECT is(
  has_table_privilege('anon', 'public.public_identity_events', 'SELECT')
    OR has_table_privilege('authenticated', 'public.public_identity_events', 'SELECT'),
  false,
  'ningun cliente de Data API consulta la auditoria'
);
SELECT is(
  has_table_privilege('service_role', 'public.public_identity_challenges', 'SELECT'),
  true,
  'el backend conserva acceso explicito a desafios'
);
SELECT is(
  has_table_privilege('service_role', 'public.customer_identities', 'SELECT'),
  true,
  'el backend conserva acceso explicito a identidades'
);
SELECT is(
  has_table_privilege('service_role', 'public.public_identity_events', 'SELECT'),
  true,
  'el backend conserva acceso explicito a auditoria'
);

INSERT INTO public.organizations (id, name)
VALUES ('32000000-0000-4000-8000-000000000001', 'Identidad Publica Test');

SELECT throws_ok(
  $$ INSERT INTO public.public_identity_challenges (
       organization_id, channel, contact_hash, expires_at
     ) VALUES (
       '32000000-0000-4000-8000-000000000001', 'FAX', repeat('a', 64), now() + interval '10 minutes'
     ) $$,
  '23514',
  NULL,
  'la base rechaza canales externos al contrato'
);
SELECT throws_ok(
  $$ INSERT INTO public.public_identity_challenges (
       organization_id, channel, contact_hash, expires_at
     ) VALUES (
       '32000000-0000-4000-8000-000000000001', 'EMAIL', 'contacto-en-claro', now() + interval '10 minutes'
     ) $$,
  '23514',
  NULL,
  'la base rechaza contactos que no sean huellas HMAC'
);
SELECT throws_ok(
  $$ INSERT INTO public.public_identity_challenges (
       organization_id, channel, contact_hash, attempt_count, expires_at
     ) VALUES (
       '32000000-0000-4000-8000-000000000001', 'EMAIL', repeat('a', 64), 6, now() + interval '10 minutes'
     ) $$,
  '23514',
  NULL,
  'la base limita los intentos de verificacion'
);

INSERT INTO public.public_identity_challenges (
  organization_id,
  channel,
  contact_hash,
  expires_at
)
VALUES (
  '32000000-0000-4000-8000-000000000001',
  'EMAIL',
  repeat('a', 64),
  now() + interval '10 minutes'
);
DELETE FROM public.organizations
WHERE id = '32000000-0000-4000-8000-000000000001';

SELECT is(
  (
    SELECT count(*)
    FROM public.public_identity_challenges
    WHERE organization_id = '32000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'eliminar una organizacion limpia sus desafios en cascada'
);

SELECT * FROM finish();
ROLLBACK;
