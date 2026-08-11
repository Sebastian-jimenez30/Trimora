BEGIN;

SELECT plan(10);

SELECT has_index(
  'public', 'transactions', 'transactions_org_created_idx',
  'el historico financiero tiene indice por empresa y fecha'
);
SELECT has_index(
  'public', 'transactions', 'transactions_org_client_type_status_created_id_idx',
  'las cuentas por cobrar FIFO tienen un indice compuesto'
);
SELECT has_index(
  'public', 'appointments', 'appointments_org_start_idx',
  'la agenda tiene indice por empresa y hora de inicio'
);
SELECT has_index(
  'public', 'transaction_payments', 'transaction_payments_created_transaction_idx',
  'los abonos tienen indice por fecha y transaccion'
);
SELECT has_index(
  'public', 'inventory_movements', 'inventory_movements_org_product_created_idx',
  'el kardex tiene indice por empresa, producto y fecha'
);
SELECT has_index(
  'public', 'inventory_movements', 'inventory_movements_org_transaction_idx',
  'la trazabilidad de inventario tiene indice compuesto por empresa y transaccion'
);

CREATE FUNCTION pg_temp.explain_json(statement text)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  query_plan json;
BEGIN
  EXECUTE 'EXPLAIN (FORMAT JSON) ' || statement INTO query_plan;
  RETURN query_plan::jsonb;
END
$function$;

SET LOCAL enable_seqscan = off;

SELECT ok(
  pg_temp.explain_json($query$
    SELECT id
    FROM public.transactions
    WHERE organization_id = '10000000-0000-0000-0000-000000000001'
      AND created_at >= '2026-01-01T00:00:00Z'
      AND created_at < '2027-01-01T00:00:00Z'
    ORDER BY created_at DESC, id DESC
    LIMIT 26
  $query$)::text LIKE '%transactions_org_created_idx%',
  'el historico paginado puede usar su indice temporal'
);

SELECT ok(
  pg_temp.explain_json($query$
    SELECT id
    FROM public.transactions
    WHERE organization_id = '10000000-0000-0000-0000-000000000001'
      AND client_id = '60000000-0000-0000-0000-000000000001'
      AND type = 'INCOME'
      AND status = 'PENDING'
    ORDER BY created_at, id
    FOR UPDATE
  $query$)::text LIKE '%transactions_org_client_type_status_created_id_idx%',
  'el cobro FIFO puede localizar y bloquear la deuda con el indice compuesto'
);

SELECT ok(
  pg_temp.explain_json($query$
    SELECT id
    FROM public.appointments
    WHERE organization_id = '10000000-0000-0000-0000-000000000001'
      AND start_time >= '2026-08-01T00:00:00Z'
      AND start_time < '2026-09-01T00:00:00Z'
    ORDER BY start_time
  $query$)::text LIKE '%appointments_org_start_idx%',
  'la agenda por rango puede usar su indice temporal'
);

SELECT ok(
  pg_temp.explain_json($query$
    SELECT transaction_id
    FROM public.transaction_payments
    WHERE created_at >= '2026-08-01T00:00:00Z'
      AND created_at < '2026-09-01T00:00:00Z'
    ORDER BY created_at DESC
  $query$)::text LIKE '%transaction_payments_created_transaction_idx%',
  'el flujo de abonos por rango puede usar su indice temporal'
);

SELECT * FROM finish();
ROLLBACK;
