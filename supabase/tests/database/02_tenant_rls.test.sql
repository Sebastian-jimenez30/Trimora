BEGIN;

SELECT plan(22);

INSERT INTO auth.users (id, email, aud, role)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'admin-a@trimora.test', 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000002', 'barber-a@trimora.test', 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000003', 'admin-b@trimora.test', 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000004', 'new-member@trimora.test', 'authenticated', 'authenticated');

INSERT INTO public.organizations (id, name)
VALUES
  ('20000000-0000-0000-0000-000000000001', 'Organización A'),
  ('20000000-0000-0000-0000-000000000002', 'Organización B');

INSERT INTO public.organization_members (id, organization_id, user_id, role)
VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'ADMIN'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'BARBER'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'ADMIN');

INSERT INTO public.services (id, organization_id, name, duration_minutes, price)
VALUES
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Corte A', 30, 30000),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Corte B', 30, 35000);

INSERT INTO public.products (id, organization_id, name, category, current_stock, minimum_stock)
VALUES
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Producto A', 'VENTA', 10, 0),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Producto B', 'VENTA', 10, 0);

INSERT INTO public.clients (id, organization_id, first_name)
VALUES
  ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Cliente A'),
  ('60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Cliente B');

INSERT INTO public.transactions (
  id, organization_id, client_id, type, total_amount, paid_amount, payment_method, status
)
VALUES
  ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'INCOME', 100, 50, 'CREDIT', 'PENDING'),
  ('70000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', 'INCOME', 100, 50, 'CREDIT', 'PENDING');

INSERT INTO public.transaction_items (
  id, transaction_id, item_type, item_id, quantity, unit_price, subtotal
)
VALUES
  ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'PRODUCT', '50000000-0000-0000-0000-000000000001', 1, 100, 100),
  ('80000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', 'PRODUCT', '50000000-0000-0000-0000-000000000002', 1, 100, 100);

INSERT INTO public.chat_messages (organization_id, telegram_user_id, role, content)
VALUES
  ('20000000-0000-0000-0000-000000000001', 'web_10000000-0000-0000-0000-000000000001', 'user', 'Propio'),
  ('20000000-0000-0000-0000-000000000001', 'web_10000000-0000-0000-0000-000000000002', 'user', 'Otro usuario');

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT * FROM public.clients $$,
  '42501',
  NULL,
  'anon no puede consultar clientes'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.organizations $$,
  ARRAY[1::bigint],
  'el admin A solo ve su organización'
);
SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.organization_members $$,
  ARRAY[2::bigint],
  'el admin A solo ve miembros de su organización'
);
SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.clients $$,
  ARRAY[1::bigint],
  'el admin A no ve clientes de B'
);
SELECT lives_ok(
  $$ INSERT INTO public.clients (id, organization_id, first_name)
     VALUES ('60000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'Cliente nuevo A') $$,
  'un miembro puede crear un cliente de su organización'
);
SELECT throws_ok(
  $$ INSERT INTO public.clients (organization_id, first_name)
     VALUES ('20000000-0000-0000-0000-000000000002', 'Intruso') $$,
  '42501',
  NULL,
  'WITH CHECK impide crear clientes para otra organización'
);
SELECT lives_ok(
  $$ UPDATE public.clients SET first_name = 'Cliente A editado'
     WHERE id = '60000000-0000-0000-0000-000000000001' $$,
  'un miembro puede actualizar una fila propia visible'
);
SELECT throws_ok(
  $$ UPDATE public.clients SET organization_id = '20000000-0000-0000-0000-000000000002'
     WHERE id = '60000000-0000-0000-0000-000000000001' $$,
  '42501',
  NULL,
  'WITH CHECK impide mover una fila a otra organización'
);
SELECT lives_ok(
  $$ DELETE FROM public.clients
     WHERE id = '60000000-0000-0000-0000-000000000003' $$,
  'un miembro puede eliminar una fila propia'
);
SELECT results_eq(
  $$ DELETE FROM public.clients
     WHERE id = '60000000-0000-0000-0000-000000000002' RETURNING id $$,
  $$ SELECT NULL::uuid WHERE false $$,
  'el DELETE cruzado no encuentra filas de otra organización'
);
SELECT lives_ok(
  $$ INSERT INTO public.services (organization_id, name, duration_minutes, price)
     VALUES ('20000000-0000-0000-0000-000000000001', 'Servicio admin', 20, 20000) $$,
  'ADMIN puede administrar el catálogo de servicios'
);
SELECT throws_ok(
  $$ INSERT INTO public.services (organization_id, name, duration_minutes, price)
     VALUES ('20000000-0000-0000-0000-000000000002', 'Servicio intruso', 20, 20000) $$,
  '42501',
  NULL,
  'ADMIN no puede administrar el catálogo de otra organización'
);
SELECT lives_ok(
  $$ INSERT INTO public.invitations (organization_id, email, role)
     VALUES ('20000000-0000-0000-0000-000000000001', 'invite@trimora.test', 'BARBER') $$,
  'ADMIN puede crear invitaciones de su organización'
);
SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.transaction_items $$,
  ARRAY[1::bigint],
  'los ítems heredan el aislamiento de su transacción'
);
SELECT throws_ok(
  $$ INSERT INTO public.transaction_payments (transaction_id, amount, payment_method)
     VALUES ('70000000-0000-0000-0000-000000000002', 10, 'CASH') $$,
  '42501',
  NULL,
  'no se puede abonar una transacción de otra organización'
);
SELECT lives_ok(
  $$ INSERT INTO public.transaction_payments (transaction_id, amount, payment_method)
     VALUES ('70000000-0000-0000-0000-000000000001', 10, 'CASH') $$,
  'se puede abonar una transacción propia'
);
SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.chat_messages $$,
  ARRAY[1::bigint],
  'cada usuario solo ve su propio chat web'
);
SELECT throws_ok(
  $$ INSERT INTO public.chat_messages (organization_id, telegram_user_id, role, content)
     VALUES ('20000000-0000-0000-0000-000000000001', 'web_10000000-0000-0000-0000-000000000002', 'user', 'Intruso') $$,
  '42501',
  NULL,
  'un usuario no puede escribir en el chat de otro'
);

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.services $$,
  ARRAY[2::bigint],
  'BARBER puede consultar los servicios de su organización'
);
SELECT throws_ok(
  $$ INSERT INTO public.services (organization_id, name, duration_minutes, price)
     VALUES ('20000000-0000-0000-0000-000000000001', 'Servicio barber', 20, 20000) $$,
  '42501',
  NULL,
  'BARBER no puede modificar el catálogo reservado a ADMIN'
);
SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.invitations $$,
  ARRAY[0::bigint],
  'BARBER no puede consultar invitaciones'
);

SET LOCAL request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
SELECT results_eq(
  $$ SELECT first_name FROM public.clients ORDER BY first_name $$,
  ARRAY['Cliente B'::text],
  'el admin B solo ve datos de B'
);

SELECT * FROM finish();
ROLLBACK;
