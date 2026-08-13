BEGIN;

SELECT plan(25);

INSERT INTO auth.users (id, email, aud, role)
VALUES ('11000000-0000-0000-0000-000000000001', 'integrity@trimora.test', 'authenticated', 'authenticated');

INSERT INTO public.organizations (id, name)
VALUES
  ('21000000-0000-0000-0000-000000000001', 'Integridad A'),
  ('21000000-0000-0000-0000-000000000002', 'Integridad B');

INSERT INTO public.organization_members (id, organization_id, user_id, role)
VALUES ('31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'ADMIN');

INSERT INTO public.services (id, organization_id, name, duration_minutes, price)
VALUES
  ('41000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'Servicio A', 30, 100),
  ('41000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', 'Servicio B', 30, 100);

INSERT INTO public.products (id, organization_id, name, category, current_stock, minimum_stock)
VALUES
  ('51000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'Producto A', 'CONSUMO', 10, 0),
  ('51000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', 'Producto B', 'CONSUMO', 10, 0);

INSERT INTO public.clients (id, organization_id, first_name)
VALUES
  ('61000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'Cliente A'),
  ('61000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', 'Cliente B');

INSERT INTO public.transactions (
  id, organization_id, client_id, type, total_amount, paid_amount, payment_method, status
)
VALUES ('71000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'INCOME', 100, 100, 'CASH', 'COMPLETED');

SELECT throws_ok(
  $$ INSERT INTO public.organization_members (organization_id, user_id, role)
     VALUES ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'ADMIN') $$,
  '23505', NULL, 'una persona solo tiene una membresía por organización'
);
SELECT throws_ok(
  $$ INSERT INTO public.organization_members (organization_id, user_id, role)
     VALUES ('21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001', 'OWNER') $$,
  '23514', NULL, 'las membresías rechazan roles desconocidos'
);
SELECT throws_ok(
  $$ INSERT INTO public.services (organization_id, name, duration_minutes, price)
     VALUES ('21000000-0000-0000-0000-000000000001', 'Inválido', 0, 100) $$,
  '23514', NULL, 'un servicio debe tener duración positiva'
);
SELECT throws_ok(
  $$ INSERT INTO public.products (organization_id, name, category, current_stock, minimum_stock)
     VALUES ('21000000-0000-0000-0000-000000000001', 'Inválido', 'CONSUMO', -1, 0) $$,
  '23514', NULL, 'el inventario no acepta stock negativo'
);
SELECT throws_ok(
  $$ INSERT INTO public.service_materials (service_id, product_id, quantity_used)
     VALUES ('41000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 0) $$,
  '23514', NULL, 'un consumible debe usar una cantidad positiva'
);
SELECT throws_ok(
  $$ INSERT INTO public.service_materials (service_id, product_id, quantity_used)
     VALUES ('41000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', 1) $$,
  '23514', NULL, 'un servicio no puede consumir productos de otra organización'
);
SELECT throws_ok(
  $$ INSERT INTO public.appointments (
       organization_id, client_id, staff_id, service_id, start_time, end_time
     ) VALUES (
       '21000000-0000-0000-0000-000000000001',
       '61000000-0000-0000-0000-000000000001',
       '31000000-0000-0000-0000-000000000001',
       '41000000-0000-0000-0000-000000000001', now(), now()
     ) $$,
  '23514', NULL, 'una cita debe terminar después de comenzar'
);
SELECT throws_ok(
  $$ INSERT INTO public.appointments (
       organization_id, client_id, staff_id, service_id, start_time, end_time
     ) VALUES (
       '21000000-0000-0000-0000-000000000001',
       '61000000-0000-0000-0000-000000000002',
       '31000000-0000-0000-0000-000000000001',
       '41000000-0000-0000-0000-000000000001', now(), now() + interval '30 minutes'
     ) $$,
  '23503', NULL, 'una cita no puede apuntar a un cliente de otra organización'
);
SELECT throws_ok(
  $$ INSERT INTO public.transactions (organization_id, type, total_amount, status)
     VALUES ('21000000-0000-0000-0000-000000000001', 'INCOME', -1, 'COMPLETED') $$,
  '23514', NULL, 'una transacción debe tener total positivo'
);
SELECT throws_ok(
  $$ INSERT INTO public.transactions (
       organization_id, type, total_amount, paid_amount, payment_method, status
     ) VALUES (
       '21000000-0000-0000-0000-000000000001', 'INCOME', 100, 101, 'CASH', 'COMPLETED'
     ) $$,
  '23514', NULL, 'lo abonado no puede superar el total'
);
SELECT throws_ok(
  $$ INSERT INTO public.transactions (
       organization_id, type, total_amount, paid_amount, payment_method, status
     ) VALUES (
       '21000000-0000-0000-0000-000000000001', 'INCOME', 100, 0, 'CREDIT', 'PENDING'
     ) $$,
  '23514', NULL, 'un crédito exige un cliente'
);
SELECT throws_ok(
  $$ INSERT INTO public.transactions (
       organization_id, client_id, type, total_amount, paid_amount, payment_method, status
     ) VALUES (
       '21000000-0000-0000-0000-000000000001',
       '61000000-0000-0000-0000-000000000002',
       'INCOME', 100, 0, 'CREDIT', 'PENDING'
     ) $$,
  '23503', NULL, 'una transacción no puede asociar un cliente de otro tenant'
);
SELECT throws_ok(
  $$ INSERT INTO public.transaction_items (
       transaction_id, item_type, item_id, quantity, unit_price, subtotal
     ) VALUES (
       '71000000-0000-0000-0000-000000000001',
       'PRODUCT', '51000000-0000-0000-0000-000000000001', 0, 100, 0
     ) $$,
  '23514', NULL, 'un ítem debe tener cantidad positiva'
);
SELECT throws_ok(
  $$ INSERT INTO public.transaction_items (
       transaction_id, item_type, item_id, quantity, unit_price, subtotal
     ) VALUES (
       '71000000-0000-0000-0000-000000000001',
       'PRODUCT', '51000000-0000-0000-0000-000000000002', 1, 100, 100
     ) $$,
  '23514', NULL, 'un ítem no puede pertenecer a otra organización'
);
SELECT throws_ok(
  $$ INSERT INTO public.transaction_payments (transaction_id, amount, payment_method)
     VALUES ('71000000-0000-0000-0000-000000000001', 0, 'CASH') $$,
  '23514', NULL, 'un abono debe ser positivo'
);
SELECT lives_ok(
  $$ INSERT INTO public.transaction_payments (transaction_id, amount, payment_method)
     VALUES ('71000000-0000-0000-0000-000000000001', 80, 'CASH') $$,
  'un abono válido puede registrarse'
);
SELECT throws_ok(
  $$ INSERT INTO public.transaction_payments (transaction_id, amount, payment_method)
     VALUES ('71000000-0000-0000-0000-000000000001', 21, 'CASH') $$,
  '23514', NULL, 'los abonos acumulados no superan el total de la transacción'
);
SELECT throws_ok(
  $$ INSERT INTO public.inventory_movements (
       organization_id, product_id, type, quantity, previous_stock, new_stock
     ) VALUES (
       '21000000-0000-0000-0000-000000000001',
       '51000000-0000-0000-0000-000000000001', 'OUT', 3, 2, -1
     ) $$,
  '23514', NULL, 'un movimiento no puede dejar stock negativo'
);
SELECT throws_ok(
  $$ INSERT INTO public.inventory_movements (
       organization_id, product_id, type, quantity, previous_stock, new_stock
     ) VALUES (
       '21000000-0000-0000-0000-000000000001',
       '51000000-0000-0000-0000-000000000001', 'IN', 2, 1, 4
     ) $$,
  '23514', NULL, 'el nuevo stock debe concordar aritméticamente con el movimiento'
);
SELECT throws_ok(
  $$ INSERT INTO public.chat_messages (organization_id, telegram_user_id, role, content)
     VALUES ('21000000-0000-0000-0000-000000000001', 'web_x', 'system', 'Inválido') $$,
  '23514', NULL, 'el chat rechaza roles no soportados'
);

SELECT lives_ok(
  $$ INSERT INTO public.webhook_events (
       organization_id, provider, external_event_id, payload_hash
     ) VALUES (
       '21000000-0000-0000-0000-000000000001', 'KAPSO', 'delivery-1',
       'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
     ) $$,
  'un evento externo valido puede reclamarse'
);
SELECT throws_ok(
  $$ INSERT INTO public.webhook_events (
       organization_id, provider, external_event_id, payload_hash
     ) VALUES (
       '21000000-0000-0000-0000-000000000001', 'KAPSO', 'delivery-1',
       'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
     ) $$,
  '23505', NULL, 'un evento repetido no puede reclamarse dos veces'
);
SELECT throws_ok(
  $$ INSERT INTO public.webhook_events (
       organization_id, provider, external_event_id, payload_hash
     ) VALUES (
       '21000000-0000-0000-0000-000000000001', 'UNKNOWN', 'delivery-2',
       'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
     ) $$,
  '23514', NULL, 'los eventos rechazan proveedores desconocidos'
);
SELECT throws_ok(
  $$ INSERT INTO public.webhook_events (
       organization_id, provider, external_event_id, payload_hash
     ) VALUES (
       '21000000-0000-0000-0000-000000000001', 'TELEGRAM', 'update-1', 'raw-payload'
     ) $$,
  '23514', NULL, 'la trazabilidad solo admite una huella SHA256 y no un payload'
);
SELECT throws_ok(
  $$ INSERT INTO public.webhook_events (
       organization_id, provider, external_event_id, payload_hash, status
     ) VALUES (
       '21000000-0000-0000-0000-000000000001', 'TELEGRAM', 'update-2',
       'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'FAILED'
     ) $$,
  '23514', NULL, 'un evento fallido exige cierre y codigo de fallo'
);

SELECT * FROM finish();
ROLLBACK;
