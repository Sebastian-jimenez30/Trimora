BEGIN;

SELECT plan(15);

SELECT ok(
  to_regclass('public.organization_public_profiles') IS NOT NULL,
  'existe la tabla de perfiles publicos'
);

INSERT INTO public.organizations (id, name)
VALUES
  ('31000000-0000-0000-0000-000000000001', 'Barberia Stage One'),
  ('31000000-0000-0000-0000-000000000002', 'Otra Barberia');

SELECT is(
  (
    SELECT count(*)
    FROM public.organization_public_profiles
    WHERE organization_id IN (
      '31000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000002'
    )
  ),
  2::bigint,
  'cada organizacion nueva recibe exactamente un perfil publico'
);

SELECT is(
  (
    SELECT slug
    FROM public.organization_public_profiles
    WHERE organization_id = '31000000-0000-0000-0000-000000000001'
  ),
  'barberia-stage-one-31000000-0000-0000-0000-000000000001',
  'el slug se normaliza y conserva un sufijo estable'
);

SELECT is(
  (
    SELECT display_name
    FROM public.organization_public_profiles
    WHERE organization_id = '31000000-0000-0000-0000-000000000001'
  ),
  'Barberia Stage One',
  'el nombre publico parte del nombre vigente sin modificar la organizacion'
);

SELECT is(
  (
    SELECT time_zone
    FROM public.organization_public_profiles
    WHERE organization_id = '31000000-0000-0000-0000-000000000001'
  ),
  'America/Bogota',
  'la zona horaria inicial es explicita'
);

SELECT is(
  (
    SELECT
      public_profile_enabled OR public_catalog_enabled OR public_booking_enabled
      OR public_self_service_enabled OR public_chat_enabled OR reminders_enabled
    FROM public.organization_public_profiles
    WHERE organization_id = '31000000-0000-0000-0000-000000000001'
  ),
  false,
  'todas las capacidades publicas nacen apagadas'
);

SELECT throws_ok(
  $$ UPDATE public.organization_public_profiles
     SET slug = 'Slug Invalido'
     WHERE organization_id = '31000000-0000-0000-0000-000000000001' $$,
  '23514',
  NULL,
  'la base rechaza slugs fuera del contrato publico'
);

SELECT throws_ok(
  $$ UPDATE public.organization_public_profiles
     SET slug = 'barberia-stage-one-31000000-0000-0000-0000-000000000001'
     WHERE organization_id = '31000000-0000-0000-0000-000000000002' $$,
  '23505',
  NULL,
  'dos organizaciones no pueden compartir slug'
);

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.organization_public_profiles'::regclass),
  true,
  'el perfil publico tiene RLS habilitado'
);

SELECT is(
  (
    SELECT relforcerowsecurity
    FROM pg_class
    WHERE oid = 'public.organization_public_profiles'::regclass
  ),
  true,
  'el perfil publico fuerza RLS incluso para propietarios sin BYPASSRLS'
);

SELECT is(
  has_table_privilege('anon', 'public.organization_public_profiles', 'SELECT'),
  false,
  'anon no consulta directamente la tabla'
);

SELECT is(
  has_table_privilege('authenticated', 'public.organization_public_profiles', 'SELECT'),
  false,
  'authenticated no consulta directamente la tabla'
);

SELECT is(
  has_table_privilege('service_role', 'public.organization_public_profiles', 'SELECT'),
  true,
  'el backend conserva acceso explicito al perfil publico'
);

SELECT is(
  has_function_privilege('anon', 'private.create_organization_public_profile()', 'EXECUTE')
    OR has_function_privilege(
      'authenticated',
      'private.create_organization_public_profile()',
      'EXECUTE'
    )
    OR has_function_privilege(
      'anon',
      'private.touch_organization_public_profile()',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'private.touch_organization_public_profile()',
      'EXECUTE'
    ),
  false,
  'los roles de Data API no ejecutan directamente el trigger privado'
);

DELETE FROM public.organizations
WHERE id = '31000000-0000-0000-0000-000000000001';

SELECT is(
  (
    SELECT count(*)
    FROM public.organization_public_profiles
    WHERE organization_id = '31000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'el perfil se elimina en cascada con su organizacion'
);

SELECT * FROM finish();
ROLLBACK;
