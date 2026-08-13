BEGIN;

SELECT plan(9);

INSERT INTO public.organizations (id, name)
VALUES
  ('22000000-0000-0000-0000-000000000001', 'Dominio A'),
  ('22000000-0000-0000-0000-000000000002', 'Dominio B');

INSERT INTO public.clients (id, organization_id, first_name)
VALUES
  ('62000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', 'Cliente A'),
  ('62000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000001', 'Cliente B');

INSERT INTO public.products (
  id, organization_id, name, category, current_stock, minimum_stock, sale_price
)
VALUES (
  '52000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  'Producto trazable', 'VENTA', 9, 0, 10
);

INSERT INTO public.transactions (
  id, organization_id, client_id, type, total_amount, paid_amount, payment_method, status
)
VALUES (
  '72000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  'INCOME', 100, 100, 'CASH', 'COMPLETED'
);

SELECT is(
  (SELECT total_spent FROM public.clients WHERE id = '62000000-0000-0000-0000-000000000001'),
  100::numeric,
  'insertar una venta incrementa el total gastado'
);

UPDATE public.transactions
SET total_amount = 120, paid_amount = 120
WHERE id = '72000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT total_spent FROM public.clients WHERE id = '62000000-0000-0000-0000-000000000001'),
  120::numeric,
  'editar el monto reconcilia el total gastado'
);

UPDATE public.transactions
SET status = 'REFUNDED'
WHERE id = '72000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT total_spent FROM public.clients WHERE id = '62000000-0000-0000-0000-000000000001'),
  0::numeric,
  'una venta reembolsada deja de sumar al cliente'
);

UPDATE public.transactions
SET status = 'COMPLETED', client_id = '62000000-0000-0000-0000-000000000002'
WHERE id = '72000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT total_spent FROM public.clients WHERE id = '62000000-0000-0000-0000-000000000001'),
  0::numeric,
  'mover una venta conserva reconciliado el cliente anterior'
);
SELECT is(
  (SELECT total_spent FROM public.clients WHERE id = '62000000-0000-0000-0000-000000000002'),
  120::numeric,
  'mover una venta suma al cliente nuevo'
);

INSERT INTO public.inventory_movements (
  organization_id, product_id, transaction_id, type, quantity, previous_stock, new_stock
)
VALUES (
  '22000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  'OUT', 1, 10, 9
);
SELECT is(
  (SELECT transaction_id FROM public.inventory_movements WHERE product_id = '52000000-0000-0000-0000-000000000001'),
  '72000000-0000-0000-0000-000000000001'::uuid,
  'el movimiento de inventario conserva la venta de origen'
);

INSERT INTO public.transactions (
  id, organization_id, type, total_amount, paid_amount, payment_method, status
)
VALUES (
  '72000000-0000-0000-0000-000000000002',
  '22000000-0000-0000-0000-000000000002',
  'EXPENSE', 20, 0, 'CASH', 'COMPLETED'
);
SELECT throws_ok(
  $$ UPDATE public.inventory_movements
     SET transaction_id = '72000000-0000-0000-0000-000000000002'
     WHERE product_id = '52000000-0000-0000-0000-000000000001' $$,
  '23503', NULL,
  'inventario no puede enlazarse a una transaccion de otro tenant'
);

DELETE FROM public.transactions WHERE id = '72000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT total_spent FROM public.clients WHERE id = '62000000-0000-0000-0000-000000000002'),
  0::numeric,
  'eliminar la venta resta su monto del cliente'
);
SELECT is(
  (SELECT count(*) FROM public.inventory_movements WHERE transaction_id = '72000000-0000-0000-0000-000000000001'),
  0::bigint,
  'eliminar la venta elimina su trazabilidad de inventario por cascada'
);

SELECT * FROM finish();
ROLLBACK;
