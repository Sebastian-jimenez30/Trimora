BEGIN;

SELECT plan(14);

SELECT is(
  (
    SELECT count(*)
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY (ARRAY[
        'public_booking_settings', 'staff_services',
        'availability_windows', 'availability_blocks'
      ])
  ),
  4::bigint,
  'existen las cuatro estructuras privadas de disponibilidad'
);

INSERT INTO public.organizations (id, name)
VALUES ('32000000-0000-0000-0000-000000000001', 'Barberia Disponibilidad');

SELECT is(
  (
    SELECT count(*)
    FROM public.public_booking_settings
    WHERE organization_id = '32000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'cada organización nueva recibe una política de reserva'
);

SELECT results_eq(
  $$
    SELECT minimum_notice_minutes, maximum_advance_days, slot_interval_minutes, buffer_minutes
    FROM public.public_booking_settings
    WHERE organization_id = '32000000-0000-0000-0000-000000000001'
  $$,
  $$ VALUES (60, 60, 15, 0) $$,
  'las políticas nacen con valores seguros y compatibles'
);

SELECT throws_ok(
  $$
    UPDATE public.public_booking_settings
    SET slot_interval_minutes = 0
    WHERE organization_id = '32000000-0000-0000-0000-000000000001'
  $$,
  '23514',
  NULL,
  'la base rechaza intervalos inválidos'
);

SELECT throws_ok(
  $$
    INSERT INTO public.availability_windows (
      organization_id, day_of_week, start_minute, end_minute
    ) VALUES (
      '32000000-0000-0000-0000-000000000001', 8, 540, 1080
    )
  $$,
  '23514',
  NULL,
  'la base rechaza días fuera de ISO 1 a 7'
);

SELECT throws_ok(
  $$
    INSERT INTO public.availability_blocks (
      organization_id, kind, starts_at, ends_at
    ) VALUES (
      '32000000-0000-0000-0000-000000000001',
      'CLOSED', '2026-08-20 15:00:00+00', '2026-08-20 14:00:00+00'
    )
  $$,
  '23514',
  NULL,
  'la base rechaza bloqueos con periodo invertido'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_class
    WHERE oid = ANY (ARRAY[
      'public.public_booking_settings'::regclass,
      'public.staff_services'::regclass,
      'public.availability_windows'::regclass,
      'public.availability_blocks'::regclass
    ]) AND relrowsecurity AND relforcerowsecurity
  ),
  4::bigint,
  'todas las tablas nuevas tienen RLS habilitada y forzada'
);

SELECT is(
  (
    SELECT count(*)
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY (ARRAY[
        'public_booking_settings', 'staff_services',
        'availability_windows', 'availability_blocks'
      ])
      AND has_table_privilege('anon', format('%I.%I', table_schema, table_name), 'SELECT')
  ),
  0::bigint,
  'anon no consulta tablas internas de disponibilidad'
);

SELECT is(
  (
    SELECT count(*)
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY (ARRAY[
        'public_booking_settings', 'staff_services',
        'availability_windows', 'availability_blocks'
      ])
      AND has_table_privilege('authenticated', format('%I.%I', table_schema, table_name), 'SELECT')
  ),
  0::bigint,
  'authenticated tampoco omite la frontera server-only'
);

SELECT is(
  (
    SELECT count(*)
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY (ARRAY[
        'public_booking_settings', 'staff_services',
        'availability_windows', 'availability_blocks'
      ])
      AND has_table_privilege('service_role', format('%I.%I', table_schema, table_name), 'SELECT')
  ),
  4::bigint,
  'service_role conserva acceso explícito para el backend'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = ANY (ARRAY[
        'staff_services_org_service_staff_idx',
        'availability_windows_org_staff_day_idx',
        'availability_blocks_org_starts_ends_idx',
        'availability_blocks_org_staff_starts_idx'
      ])
  ),
  4::bigint,
  'las búsquedas críticas tienen índices compuestos'
);

SELECT is(
  has_function_privilege('anon', 'private.create_public_booking_settings()', 'EXECUTE')
    OR has_function_privilege(
      'authenticated', 'private.create_public_booking_settings()', 'EXECUTE'
    ),
  false,
  'los roles públicos no ejecutan el trigger privado'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_constraint
    WHERE conname IN (
      'staff_services_org_staff_fk', 'staff_services_org_service_fk',
      'availability_windows_org_staff_fk', 'availability_blocks_org_staff_fk'
    )
  ),
  4::bigint,
  'las relaciones con profesionales y servicios conservan el tenant'
);

DELETE FROM public.organizations
WHERE id = '32000000-0000-0000-0000-000000000001';

SELECT is(
  (
    SELECT count(*)
    FROM public.public_booking_settings
    WHERE organization_id = '32000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'la configuración se elimina en cascada únicamente al eliminar su organización'
);

SELECT * FROM finish();
ROLLBACK;
