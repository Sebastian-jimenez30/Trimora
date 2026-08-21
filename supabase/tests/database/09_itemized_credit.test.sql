BEGIN;

SELECT plan(10);

SELECT ok(
  to_regclass('public.transaction_payment_allocations') IS NOT NULL,
  'existe la tabla de asignaciones de pagos por item'
);

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.transaction_payment_allocations'::regclass),
  true,
  'las asignaciones tienen RLS habilitado'
);

SELECT is(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.transaction_payment_allocations'::regclass),
  true,
  'las asignaciones fuerzan RLS'
);

SELECT is(
  has_table_privilege('anon', 'public.transaction_payment_allocations', 'SELECT'),
  false,
  'anon no consulta asignaciones financieras'
);

SELECT is(
  has_table_privilege('authenticated', 'public.transaction_payment_allocations', 'SELECT'),
  false,
  'authenticated no consulta asignaciones financieras directamente'
);

INSERT INTO public.organizations (id, name)
VALUES ('39000000-0000-0000-0000-000000000001', 'Credito por item');

INSERT INTO public.clients (id, organization_id, first_name)
VALUES (
  '49000000-0000-0000-0000-000000000001',
  '39000000-0000-0000-0000-000000000001',
  'Cliente credito'
);

INSERT INTO public.services (id, organization_id, name, price)
VALUES (
  '99000000-0000-0000-0000-000000000001',
  '39000000-0000-0000-0000-000000000001',
  'Servicio credito',
  20
);

INSERT INTO public.products (id, organization_id, name, category, sale_price)
VALUES (
  '99000000-0000-0000-0000-000000000002',
  '39000000-0000-0000-0000-000000000001',
  'Producto credito',
  'VENTA',
  10
);

INSERT INTO public.transactions (
  id, organization_id, client_id, type, total_amount, paid_amount, payment_method, status
)
VALUES
  (
    '79000000-0000-0000-0000-000000000001',
    '39000000-0000-0000-0000-000000000001',
    '49000000-0000-0000-0000-000000000001',
    'INCOME', 30, 20, 'CREDIT', 'PENDING'
  ),
  (
    '79000000-0000-0000-0000-000000000002',
    '39000000-0000-0000-0000-000000000001',
    '49000000-0000-0000-0000-000000000001',
    'INCOME', 10, 0, 'CREDIT', 'PENDING'
  );

INSERT INTO public.transaction_items (
  id, transaction_id, item_type, item_id, quantity, unit_price, subtotal
)
VALUES
  (
    '89000000-0000-0000-0000-000000000001',
    '79000000-0000-0000-0000-000000000001',
    'SERVICE', '99000000-0000-0000-0000-000000000001', 1, 20, 20
  ),
  (
    '89000000-0000-0000-0000-000000000002',
    '79000000-0000-0000-0000-000000000002',
    'PRODUCT', '99000000-0000-0000-0000-000000000002', 1, 10, 10
  );

INSERT INTO public.transaction_payments (id, transaction_id, amount, payment_method)
VALUES
  (
    '98000000-0000-0000-0000-000000000001',
    '79000000-0000-0000-0000-000000000001', 20, 'CASH'
  ),
  (
    '98000000-0000-0000-0000-000000000002',
    '79000000-0000-0000-0000-000000000002', 5, 'CASH'
  );

INSERT INTO public.transaction_payment_allocations (
  id, organization_id, transaction_id, payment_id, transaction_item_id, amount
)
VALUES (
  '97000000-0000-0000-0000-000000000001',
  '39000000-0000-0000-0000-000000000001',
  '79000000-0000-0000-0000-000000000001',
  '98000000-0000-0000-0000-000000000001',
  '89000000-0000-0000-0000-000000000001',
  20
);

SELECT is(
  (SELECT amount FROM public.transaction_payment_allocations WHERE id = '97000000-0000-0000-0000-000000000001'),
  20::numeric,
  'un pago queda relacionado con el concepto exacto'
);

SELECT throws_ok(
  $$ INSERT INTO public.transaction_payment_allocations (
       organization_id, transaction_id, payment_id, transaction_item_id, amount
     ) VALUES (
       '39000000-0000-0000-0000-000000000001',
       '79000000-0000-0000-0000-000000000001',
       '98000000-0000-0000-0000-000000000002',
       '89000000-0000-0000-0000-000000000001', 1
     ) $$,
  '23503',
  NULL,
  'un pago de otra transaccion no puede asignarse al movimiento'
);

SELECT throws_ok(
  $$ INSERT INTO public.transaction_payment_allocations (
       organization_id, transaction_id, payment_id, transaction_item_id, amount
     ) VALUES (
       '39000000-0000-0000-0000-000000000001',
       '79000000-0000-0000-0000-000000000001',
       '98000000-0000-0000-0000-000000000001',
       '89000000-0000-0000-0000-000000000002', 1
     ) $$,
  '23503',
  NULL,
  'un item de otra transaccion no puede recibir el pago'
);

SELECT throws_ok(
  $$ INSERT INTO public.transaction_payment_allocations (
       organization_id, transaction_id, payment_id, transaction_item_id, amount
     ) VALUES (
       '39000000-0000-0000-0000-000000000001',
       '79000000-0000-0000-0000-000000000001',
       '98000000-0000-0000-0000-000000000001',
       '89000000-0000-0000-0000-000000000001', 0
     ) $$,
  '23514',
  NULL,
  'una asignacion debe tener monto positivo'
);

DELETE FROM public.transaction_payments
WHERE id = '98000000-0000-0000-0000-000000000001';

SELECT is(
  (SELECT count(*) FROM public.transaction_payment_allocations),
  0::bigint,
  'eliminar un pago elimina solamente sus asignaciones en cascada'
);

SELECT * FROM finish();
ROLLBACK;
