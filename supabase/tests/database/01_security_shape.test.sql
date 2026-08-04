BEGIN;

SELECT plan(13);

SELECT is(
  (
    SELECT count(*)
    FROM pg_class
    WHERE oid = ANY (ARRAY[
      'public.organizations'::regclass,
      'public.organization_members'::regclass,
      'public.invitations'::regclass,
      'public.services'::regclass,
      'public.products'::regclass,
      'public.service_materials'::regclass,
      'public.clients'::regclass,
      'public.appointments'::regclass,
      'public.transactions'::regclass,
      'public.transaction_items'::regclass,
      'public.transaction_payments'::regclass,
      'public.inventory_movements'::regclass,
      'public.daily_summaries'::regclass,
      'public.audit_logs'::regclass,
      'public.chat_messages'::regclass,
      'public.platform_admins'::regclass,
      'public.webhook_events'::regclass,
      'public.webhook_rate_limits'::regclass
    ]) AND relrowsecurity
  ),
  18::bigint,
  'todas las tablas privadas expuestas tienen RLS habilitado'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_class
    WHERE oid = ANY (ARRAY[
      'public.organizations'::regclass,
      'public.organization_members'::regclass,
      'public.invitations'::regclass,
      'public.services'::regclass,
      'public.products'::regclass,
      'public.service_materials'::regclass,
      'public.clients'::regclass,
      'public.appointments'::regclass,
      'public.transactions'::regclass,
      'public.transaction_items'::regclass,
      'public.transaction_payments'::regclass,
      'public.inventory_movements'::regclass,
      'public.daily_summaries'::regclass,
      'public.audit_logs'::regclass,
      'public.chat_messages'::regclass,
      'public.platform_admins'::regclass,
      'public.webhook_events'::regclass,
      'public.webhook_rate_limits'::regclass
    ]) AND relforcerowsecurity
  ),
  18::bigint,
  'RLS también se fuerza para propietarios sin BYPASSRLS'
);

SELECT is(
  (
    SELECT count(*)
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY (ARRAY[
        'organizations', 'organization_members', 'invitations', 'services', 'products',
        'service_materials', 'clients', 'appointments', 'transactions', 'transaction_items',
        'transaction_payments', 'inventory_movements', 'daily_summaries', 'audit_logs',
        'chat_messages', 'platform_admins', 'webhook_events', 'webhook_rate_limits'
      ])
      AND has_table_privilege('anon', format('%I.%I', table_schema, table_name), 'SELECT')
  ),
  0::bigint,
  'anon no tiene SELECT sobre tablas privadas'
);

SELECT is(
  has_table_privilege('authenticated', 'public.platform_admins', 'SELECT'),
  false,
  'authenticated no puede consultar concesiones de plataforma'
);

SELECT is(
  (
    SELECT count(*)
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY (ARRAY['webhook_events', 'webhook_rate_limits'])
      AND has_table_privilege('authenticated', format('%I.%I', table_schema, table_name), 'SELECT')
  ),
  0::bigint,
  'las tablas de seguridad de webhooks solo son accesibles desde el servidor'
);

SELECT is(
  (
    SELECT count(*)
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY (ARRAY[
        'organizations', 'organization_members', 'invitations', 'services', 'products',
        'service_materials', 'clients', 'appointments', 'transactions', 'transaction_items',
        'transaction_payments', 'inventory_movements', 'daily_summaries', 'audit_logs',
        'chat_messages'
      ])
      AND has_table_privilege('authenticated', format('%I.%I', table_schema, table_name), 'SELECT')
  ),
  15::bigint,
  'authenticated solo recibe lectura sobre las tablas operativas gobernadas por RLS'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND NOT (roles = ARRAY['authenticated']::name[])
  ),
  'todas las políticas públicas se limitan al rol authenticated'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND cmd = 'UPDATE'
      AND (qual IS NULL OR with_check IS NULL)
  ),
  'cada política UPDATE valida la fila anterior y la resultante'
);

SELECT is(
  (
    SELECT count(*) FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'private'
      AND procedure.proname IN (
        'is_organization_member', 'has_organization_role',
        'can_access_service', 'can_access_transaction'
      )
      AND procedure.prosecdef
  ),
  4::bigint,
  'las consultas auxiliares RLS están aisladas en private y son security definer'
);

SELECT is(
  has_function_privilege('anon', 'private.is_organization_member(uuid)', 'EXECUTE'),
  false,
  'anon no puede ejecutar la función de membresía'
);

SELECT is(
  has_function_privilege('authenticated', 'private.is_organization_member(uuid)', 'EXECUTE'),
  true,
  'authenticated puede evaluar la función privada únicamente desde SQL autorizado'
);

SELECT is(
  (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'authenticated'),
  false,
  'el rol authenticated no omite RLS'
);

SELECT is(
  (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'postgres'),
  true,
  'el rol administrativo postgres omite RLS y no debe reemplazar la autorización del servidor'
);

SELECT * FROM finish();
ROLLBACK;
