-- Etapa 03: reconciliación, integridad, privilegios mínimos y RLS multiempresa.
-- Esta migración es compatible con instalaciones donde algunas tablas se crearon
-- manualmente antes de incorporarse al historial versionado.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. Reconciliar el esquema usado por la aplicación
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  email text NOT NULL,
  role text DEFAULT 'BARBER' NOT NULL,
  token uuid DEFAULT gen_random_uuid() NOT NULL,
  status text DEFAULT 'PENDING' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  telegram_user_id text NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.transaction_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  transaction_id uuid NOT NULL REFERENCES public.transactions (id) ON DELETE CASCADE,
  amount numeric(10, 2) NOT NULL,
  payment_method text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'INCOME' NOT NULL,
  ADD COLUMN IF NOT EXISTS paid_amount numeric(10, 2) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS type varchar(20),
  ADD COLUMN IF NOT EXISTS quantity numeric(12, 4),
  ADD COLUMN IF NOT EXISTS previous_stock numeric(12, 4),
  ADD COLUMN IF NOT EXISTS new_stock numeric(12, 4),
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.products
  ALTER COLUMN current_stock TYPE numeric(12, 4) USING current_stock::numeric(12, 4),
  ALTER COLUMN minimum_stock TYPE numeric(12, 4) USING minimum_stock::numeric(12, 4);

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_movements'
      AND column_name = 'movement_type'
  ) THEN
    EXECUTE $sql$
      UPDATE public.inventory_movements
      SET type = COALESCE(type, movement_type)
      WHERE type IS NULL
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_movements'
      AND column_name = 'quantity_change'
  ) THEN
    EXECUTE $sql$
      UPDATE public.inventory_movements
      SET quantity = COALESCE(quantity, abs(quantity_change)),
          previous_stock = COALESCE(previous_stock, 0),
          new_stock = COALESCE(
            new_stock,
            CASE
              WHEN COALESCE(type, movement_type) = 'IN' THEN abs(quantity_change)
              ELSE 0
            END
          )
      WHERE quantity IS NULL OR previous_stock IS NULL OR new_stock IS NULL
    $sql$;
  END IF;
END
$migration$;

UPDATE public.inventory_movements
SET type = COALESCE(type, 'IN'),
    quantity = COALESCE(quantity, 0),
    previous_stock = COALESCE(previous_stock, 0),
    new_stock = COALESCE(new_stock, 0)
WHERE type IS NULL OR quantity IS NULL OR previous_stock IS NULL OR new_stock IS NULL;

ALTER TABLE public.inventory_movements
  ALTER COLUMN type SET NOT NULL,
  ALTER COLUMN quantity TYPE numeric(12, 4) USING quantity::numeric(12, 4),
  ALTER COLUMN previous_stock TYPE numeric(12, 4) USING previous_stock::numeric(12, 4),
  ALTER COLUMN new_stock TYPE numeric(12, 4) USING new_stock::numeric(12, 4),
  ALTER COLUMN quantity SET NOT NULL,
  ALTER COLUMN previous_stock SET NOT NULL,
  ALTER COLUMN new_stock SET NOT NULL;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_movements'
      AND column_name = 'movement_type'
  ) THEN
    ALTER TABLE public.inventory_movements ALTER COLUMN movement_type DROP NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_movements'
      AND column_name = 'quantity_change'
  ) THEN
    ALTER TABLE public.inventory_movements ALTER COLUMN quantity_change DROP NOT NULL;
  END IF;
END
$migration$;

-- ---------------------------------------------------------------------------
-- 2. Restricciones e integridad entre organizaciones
-- ---------------------------------------------------------------------------

-- Consolidar membresías duplicadas antes de hacer efectiva la unicidad.
WITH ranked_memberships AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY organization_id, user_id ORDER BY created_at, id
    ) AS canonical_id,
    row_number() OVER (
      PARTITION BY organization_id, user_id ORDER BY created_at, id
    ) AS position
  FROM public.organization_members
), duplicates AS (
  SELECT id, canonical_id FROM ranked_memberships WHERE position > 1
)
UPDATE public.appointments AS appointment
SET staff_id = duplicate.canonical_id
FROM duplicates AS duplicate
WHERE appointment.staff_id = duplicate.id;

WITH ranked_memberships AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY organization_id, user_id ORDER BY created_at, id
    ) AS canonical_id,
    row_number() OVER (
      PARTITION BY organization_id, user_id ORDER BY created_at, id
    ) AS position
  FROM public.organization_members
), duplicates AS (
  SELECT id, canonical_id FROM ranked_memberships WHERE position > 1
)
UPDATE public.transactions AS tx
SET staff_id = duplicate.canonical_id
FROM duplicates AS duplicate
WHERE tx.staff_id = duplicate.id;

WITH ranked_memberships AS (
  SELECT id, row_number() OVER (
    PARTITION BY organization_id, user_id ORDER BY created_at, id
  ) AS position
  FROM public.organization_members
)
DELETE FROM public.organization_members AS member
USING ranked_memberships AS ranked
WHERE member.id = ranked.id AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS organization_members_org_user_uidx
  ON public.organization_members (organization_id, user_id);

WITH ranked_invitations AS (
  SELECT id, row_number() OVER (
    PARTITION BY organization_id, lower(email)
    ORDER BY created_at DESC, id DESC
  ) AS position
  FROM public.invitations
  WHERE status = 'PENDING'
)
DELETE FROM public.invitations AS invitation
USING ranked_invitations AS ranked
WHERE invitation.id = ranked.id AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS invitations_token_uidx
  ON public.invitations (token);
CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_org_email_uidx
  ON public.invitations (organization_id, lower(email))
  WHERE status = 'PENDING';

WITH grouped_materials AS (
  SELECT
    service_id,
    product_id,
    min(id::text)::uuid AS canonical_id,
    sum(quantity_used) AS total_quantity
  FROM public.service_materials
  GROUP BY service_id, product_id
  HAVING count(*) > 1
)
UPDATE public.service_materials AS material
SET quantity_used = grouped.total_quantity
FROM grouped_materials AS grouped
WHERE material.id = grouped.canonical_id;

WITH ranked_materials AS (
  SELECT id, row_number() OVER (
    PARTITION BY service_id, product_id ORDER BY id
  ) AS position
  FROM public.service_materials
)
DELETE FROM public.service_materials AS material
USING ranked_materials AS ranked
WHERE material.id = ranked.id AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS service_materials_service_product_uidx
  ON public.service_materials (service_id, product_id);

WITH ranked_summaries AS (
  SELECT id, row_number() OVER (
    PARTITION BY organization_id, date ORDER BY created_at DESC, id DESC
  ) AS position
  FROM public.daily_summaries
)
DELETE FROM public.daily_summaries AS summary
USING ranked_summaries AS ranked
WHERE summary.id = ranked.id AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS daily_summaries_org_date_uidx
  ON public.daily_summaries (organization_id, date);

-- Las claves compuestas impiden asociar recursos pertenecientes a organizaciones distintas.
ALTER TABLE public.clients ADD CONSTRAINT clients_org_id_unique UNIQUE (organization_id, id);
ALTER TABLE public.services ADD CONSTRAINT services_org_id_unique UNIQUE (organization_id, id);
ALTER TABLE public.products ADD CONSTRAINT products_org_id_unique UNIQUE (organization_id, id);
ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_org_id_unique UNIQUE (organization_id, id);

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_org_client_fk
    FOREIGN KEY (organization_id, client_id)
    REFERENCES public.clients (organization_id, id) NOT VALID,
  ADD CONSTRAINT appointments_org_staff_fk
    FOREIGN KEY (organization_id, staff_id)
    REFERENCES public.organization_members (organization_id, id) NOT VALID,
  ADD CONSTRAINT appointments_org_service_fk
    FOREIGN KEY (organization_id, service_id)
    REFERENCES public.services (organization_id, id) NOT VALID;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_org_client_fk
    FOREIGN KEY (organization_id, client_id)
    REFERENCES public.clients (organization_id, id) NOT VALID,
  ADD CONSTRAINT transactions_org_staff_fk
    FOREIGN KEY (organization_id, staff_id)
    REFERENCES public.organization_members (organization_id, id) NOT VALID;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_org_product_fk
    FOREIGN KEY (organization_id, product_id)
    REFERENCES public.products (organization_id, id) NOT VALID;

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_user_fk
    FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.platform_admins
  ADD CONSTRAINT platform_admins_user_fk
    FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE NOT VALID,
  ADD CONSTRAINT platform_admins_granted_by_fk
    FOREIGN KEY (granted_by) REFERENCES auth.users (id) ON DELETE SET NULL NOT VALID;

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_role_check
    CHECK (role IN ('ADMIN', 'BARBER', 'RECEPTIONIST')) NOT VALID;
ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_role_check
    CHECK (role IN ('ADMIN', 'BARBER', 'RECEPTIONIST')) NOT VALID,
  ADD CONSTRAINT invitations_status_check
    CHECK (status IN ('PENDING', 'ACCEPTED')) NOT VALID,
  ADD CONSTRAINT invitations_email_check
    CHECK (length(btrim(email)) > 3 AND position('@' IN email) > 1) NOT VALID;
ALTER TABLE public.services
  ADD CONSTRAINT services_duration_check CHECK (duration_minutes > 0) NOT VALID,
  ADD CONSTRAINT services_price_check CHECK (price >= 0) NOT VALID;
ALTER TABLE public.products
  ADD CONSTRAINT products_category_check CHECK (category IN ('VENTA', 'CONSUMO')) NOT VALID,
  ADD CONSTRAINT products_stock_check CHECK (current_stock >= 0 AND minimum_stock >= 0) NOT VALID,
  ADD CONSTRAINT products_prices_check
    CHECK ((sale_price IS NULL OR sale_price >= 0) AND (cost_price IS NULL OR cost_price >= 0))
    NOT VALID;
ALTER TABLE public.service_materials
  ADD CONSTRAINT service_materials_quantity_check CHECK (quantity_used > 0) NOT VALID;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_total_spent_check CHECK (total_spent IS NULL OR total_spent >= 0) NOT VALID;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_period_check CHECK (end_time > start_time) NOT VALID,
  ADD CONSTRAINT appointments_status_check
    CHECK (status IN ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED')) NOT VALID;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_type_check CHECK (type IN ('INCOME', 'EXPENSE')) NOT VALID,
  ADD CONSTRAINT transactions_total_check CHECK (total_amount > 0) NOT VALID,
  ADD CONSTRAINT transactions_paid_check
    CHECK (paid_amount >= 0 AND paid_amount <= total_amount) NOT VALID,
  ADD CONSTRAINT transactions_status_check
    CHECK (status IN ('PENDING', 'COMPLETED', 'REFUNDED')) NOT VALID,
  ADD CONSTRAINT transactions_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('CASH', 'CARD', 'TRANSFER', 'CREDIT'))
    NOT VALID,
  ADD CONSTRAINT transactions_credit_client_check
    CHECK (payment_method <> 'CREDIT' OR (type = 'INCOME' AND client_id IS NOT NULL)) NOT VALID;
ALTER TABLE public.transaction_items
  ADD CONSTRAINT transaction_items_type_check CHECK (item_type IN ('SERVICE', 'PRODUCT')) NOT VALID,
  ADD CONSTRAINT transaction_items_quantity_check CHECK (quantity > 0) NOT VALID,
  ADD CONSTRAINT transaction_items_amounts_check
    CHECK (unit_price >= 0 AND subtotal >= 0) NOT VALID;
ALTER TABLE public.transaction_payments
  ADD CONSTRAINT transaction_payments_amount_check CHECK (amount > 0) NOT VALID,
  ADD CONSTRAINT transaction_payments_method_check
    CHECK (payment_method IN ('CASH', 'CARD', 'TRANSFER')) NOT VALID;
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_type_check CHECK (type IN ('IN', 'OUT')) NOT VALID,
  ADD CONSTRAINT inventory_movements_stock_check
    CHECK (quantity > 0 AND previous_stock >= 0 AND new_stock >= 0) NOT VALID,
  ADD CONSTRAINT inventory_movements_arithmetic_check
    CHECK (
      (type = 'IN' AND new_stock = previous_stock + quantity)
      OR (type = 'OUT' AND new_stock = previous_stock - quantity)
    ) NOT VALID;
ALTER TABLE public.daily_summaries
  ADD CONSTRAINT daily_summaries_values_check
    CHECK (
      total_revenue IS NULL OR total_revenue >= 0
    ) NOT VALID,
  ADD CONSTRAINT daily_summaries_counts_check
    CHECK (
      (appointments_count IS NULL OR appointments_count >= 0)
      AND (new_clients_count IS NULL OR new_clients_count >= 0)
    ) NOT VALID;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_role_check CHECK (role IN ('user', 'assistant')) NOT VALID,
  ADD CONSTRAINT chat_messages_content_check CHECK (length(content) > 0) NOT VALID;
ALTER TABLE public.platform_admins
  ADD CONSTRAINT platform_admins_reason_check CHECK (length(btrim(reason)) > 0) NOT VALID,
  ADD CONSTRAINT platform_admins_revocation_check
    CHECK (revoked_at IS NULL OR revoked_at >= created_at) NOT VALID;

-- Verificar que materiales e ítems polimórficos pertenezcan al mismo tenant que su padre.
CREATE OR REPLACE FUNCTION private.enforce_service_material_organization()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  service_org uuid;
  product_org uuid;
BEGIN
  SELECT organization_id INTO service_org FROM public.services WHERE id = NEW.service_id;
  SELECT organization_id INTO product_org FROM public.products WHERE id = NEW.product_id;
  IF service_org IS NULL OR product_org IS NULL OR service_org <> product_org THEN
    RAISE EXCEPTION 'El servicio y el consumible deben pertenecer a la misma organización'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.enforce_transaction_item_organization()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  transaction_org uuid;
  item_org uuid;
BEGIN
  SELECT organization_id INTO transaction_org
  FROM public.transactions WHERE id = NEW.transaction_id;

  IF NEW.item_type = 'SERVICE' THEN
    SELECT organization_id INTO item_org FROM public.services WHERE id = NEW.item_id;
  ELSIF NEW.item_type = 'PRODUCT' THEN
    SELECT organization_id INTO item_org FROM public.products WHERE id = NEW.item_id;
  END IF;

  IF transaction_org IS NULL OR item_org IS NULL OR transaction_org <> item_org THEN
    RAISE EXCEPTION 'El ítem debe pertenecer a la organización de la transacción'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.enforce_transaction_payment_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  transaction_total numeric(10, 2);
  accumulated_amount numeric(10, 2);
BEGIN
  SELECT total_amount INTO transaction_total
  FROM public.transactions
  WHERE id = NEW.transaction_id
  FOR UPDATE;

  -- Si RLS oculta la transacción, la política de la tabla rechazará la escritura.
  IF transaction_total IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO accumulated_amount
  FROM public.transaction_payments
  WHERE transaction_id = NEW.transaction_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF accumulated_amount + NEW.amount > transaction_total THEN
    RAISE EXCEPTION 'Los abonos acumulados no pueden superar el total de la transacción'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION private.enforce_inventory_movement_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  persisted_stock numeric(12, 4);
BEGIN
  SELECT current_stock INTO persisted_stock
  FROM public.products
  WHERE id = NEW.product_id AND organization_id = NEW.organization_id;

  -- Si RLS oculta el producto, la política o la clave compuesta rechazará la escritura.
  IF persisted_stock IS NOT NULL AND persisted_stock <> NEW.new_stock THEN
    RAISE EXCEPTION 'El stock final del movimiento no coincide con el producto'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS service_materials_same_organization ON public.service_materials;
CREATE TRIGGER service_materials_same_organization
  BEFORE INSERT OR UPDATE OF service_id, product_id ON public.service_materials
  FOR EACH ROW EXECUTE FUNCTION private.enforce_service_material_organization();

DROP TRIGGER IF EXISTS transaction_items_same_organization ON public.transaction_items;
CREATE TRIGGER transaction_items_same_organization
  BEFORE INSERT OR UPDATE OF transaction_id, item_type, item_id ON public.transaction_items
  FOR EACH ROW EXECUTE FUNCTION private.enforce_transaction_item_organization();

DROP TRIGGER IF EXISTS transaction_payments_total_guard ON public.transaction_payments;
CREATE TRIGGER transaction_payments_total_guard
  BEFORE INSERT OR UPDATE OF transaction_id, amount ON public.transaction_payments
  FOR EACH ROW EXECUTE FUNCTION private.enforce_transaction_payment_total();

DROP TRIGGER IF EXISTS inventory_movements_stock_guard ON public.inventory_movements;
CREATE TRIGGER inventory_movements_stock_guard
  BEFORE INSERT OR UPDATE OF organization_id, product_id, new_stock ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION private.enforce_inventory_movement_stock();

REVOKE ALL ON FUNCTION private.enforce_service_material_organization() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.enforce_transaction_item_organization() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.enforce_transaction_payment_total() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.enforce_inventory_movement_stock() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Índices para claves foráneas, filtros multiempresa y políticas RLS
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS organization_members_user_org_idx
  ON public.organization_members (user_id, organization_id);
CREATE INDEX IF NOT EXISTS organization_members_org_role_idx
  ON public.organization_members (organization_id, role);
CREATE INDEX IF NOT EXISTS invitations_org_status_idx
  ON public.invitations (organization_id, status);
CREATE INDEX IF NOT EXISTS services_org_idx ON public.services (organization_id);
CREATE INDEX IF NOT EXISTS products_org_idx ON public.products (organization_id);
CREATE INDEX IF NOT EXISTS service_materials_product_idx ON public.service_materials (product_id);
CREATE INDEX IF NOT EXISTS clients_org_idx ON public.clients (organization_id);
CREATE INDEX IF NOT EXISTS appointments_client_idx ON public.appointments (client_id);
CREATE INDEX IF NOT EXISTS appointments_staff_idx ON public.appointments (staff_id);
CREATE INDEX IF NOT EXISTS appointments_service_idx ON public.appointments (service_id);
CREATE INDEX IF NOT EXISTS transactions_client_idx ON public.transactions (client_id);
CREATE INDEX IF NOT EXISTS transactions_staff_idx ON public.transactions (staff_id);
CREATE INDEX IF NOT EXISTS transactions_org_status_created_idx
  ON public.transactions (organization_id, status, created_at);
CREATE INDEX IF NOT EXISTS transaction_payments_created_transaction_idx
  ON public.transaction_payments (created_at, transaction_id);
CREATE INDEX IF NOT EXISTS inventory_movements_org_product_created_idx
  ON public.inventory_movements (organization_id, product_id, created_at);
CREATE INDEX IF NOT EXISTS daily_summaries_org_date_idx
  ON public.daily_summaries (organization_id, date);
CREATE INDEX IF NOT EXISTS audit_logs_org_created_idx
  ON public.audit_logs (organization_id, created_at);
CREATE INDEX IF NOT EXISTS chat_messages_org_user_created_idx
  ON public.chat_messages (organization_id, telegram_user_id, created_at);

-- ---------------------------------------------------------------------------
-- 4. Funciones privadas de autorización usadas exclusivamente por RLS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.is_organization_member(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = target_organization_id
      AND member.user_id = (SELECT auth.uid())
  );
$function$;

CREATE OR REPLACE FUNCTION private.has_organization_role(
  target_organization_id uuid,
  allowed_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = target_organization_id
      AND member.user_id = (SELECT auth.uid())
      AND member.role = ANY (allowed_roles)
  );
$function$;

CREATE OR REPLACE FUNCTION private.can_access_service(target_service_id uuid, allowed_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.services AS service
    JOIN public.organization_members AS member
      ON member.organization_id = service.organization_id
    WHERE service.id = target_service_id
      AND member.user_id = (SELECT auth.uid())
      AND member.role = ANY (allowed_roles)
  );
$function$;

CREATE OR REPLACE FUNCTION private.can_access_transaction(target_transaction_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.transactions AS tx
    JOIN public.organization_members AS member
      ON member.organization_id = tx.organization_id
    WHERE tx.id = target_transaction_id
      AND member.user_id = (SELECT auth.uid())
  );
$function$;

REVOKE ALL ON FUNCTION private.is_organization_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_organization_role(uuid, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_access_service(uuid, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_access_transaction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_organization_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_organization_role(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_service(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_transaction(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Privilegios mínimos y políticas RLS
-- ---------------------------------------------------------------------------

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.organizations,
  public.organization_members,
  public.invitations,
  public.services,
  public.products,
  public.service_materials,
  public.clients,
  public.appointments,
  public.transactions,
  public.transaction_items,
  public.transaction_payments,
  public.inventory_movements,
  public.daily_summaries,
  public.audit_logs,
  public.chat_messages
TO authenticated;

GRANT UPDATE ON public.organizations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.organization_members, public.invitations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.services, public.service_materials TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products, public.clients, public.appointments TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.transactions, public.transaction_items TO authenticated;
GRANT INSERT ON public.transaction_payments TO authenticated;
GRANT INSERT ON public.inventory_movements, public.audit_logs TO authenticated;
GRANT INSERT, UPDATE ON public.daily_summaries TO authenticated;
GRANT INSERT, DELETE ON public.chat_messages TO authenticated;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.services FORCE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.service_materials FORCE ROW LEVEL SECURITY;
ALTER TABLE public.clients FORCE ROW LEVEL SECURITY;
ALTER TABLE public.appointments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.daily_summaries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins FORCE ROW LEVEL SECURITY;

CREATE POLICY organizations_select_member ON public.organizations
  FOR SELECT TO authenticated
  USING ((SELECT private.is_organization_member(id)));
CREATE POLICY organizations_update_admin ON public.organizations
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_organization_role(id, ARRAY['ADMIN']::text[])))
  WITH CHECK ((SELECT private.has_organization_role(id, ARRAY['ADMIN']::text[])));

CREATE POLICY organization_members_select_member ON public.organization_members
  FOR SELECT TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)));
CREATE POLICY organization_members_insert_admin ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_organization_role(organization_id, ARRAY['ADMIN']::text[])));
CREATE POLICY organization_members_update_admin ON public.organization_members
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_organization_role(organization_id, ARRAY['ADMIN']::text[])))
  WITH CHECK ((SELECT private.has_organization_role(organization_id, ARRAY['ADMIN']::text[])));
CREATE POLICY organization_members_delete_admin ON public.organization_members
  FOR DELETE TO authenticated
  USING ((SELECT private.has_organization_role(organization_id, ARRAY['ADMIN']::text[])));

CREATE POLICY invitations_select_admin ON public.invitations
  FOR SELECT TO authenticated
  USING ((SELECT private.has_organization_role(organization_id, ARRAY['ADMIN']::text[])));
CREATE POLICY invitations_insert_admin ON public.invitations
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_organization_role(organization_id, ARRAY['ADMIN']::text[])));
CREATE POLICY invitations_update_admin ON public.invitations
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_organization_role(organization_id, ARRAY['ADMIN']::text[])))
  WITH CHECK ((SELECT private.has_organization_role(organization_id, ARRAY['ADMIN']::text[])));
CREATE POLICY invitations_delete_admin ON public.invitations
  FOR DELETE TO authenticated
  USING ((SELECT private.has_organization_role(organization_id, ARRAY['ADMIN']::text[])));

CREATE POLICY services_select_member ON public.services
  FOR SELECT TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)));
CREATE POLICY services_insert_admin ON public.services
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_organization_role(organization_id, ARRAY['ADMIN']::text[])));
CREATE POLICY services_update_admin ON public.services
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_organization_role(organization_id, ARRAY['ADMIN']::text[])))
  WITH CHECK ((SELECT private.has_organization_role(organization_id, ARRAY['ADMIN']::text[])));
CREATE POLICY services_delete_admin ON public.services
  FOR DELETE TO authenticated
  USING ((SELECT private.has_organization_role(organization_id, ARRAY['ADMIN']::text[])));

CREATE POLICY products_select_member ON public.products
  FOR SELECT TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)));
CREATE POLICY products_insert_member ON public.products
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_organization_member(organization_id)));
CREATE POLICY products_update_member ON public.products
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)))
  WITH CHECK ((SELECT private.is_organization_member(organization_id)));
CREATE POLICY products_delete_member ON public.products
  FOR DELETE TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)));

CREATE POLICY service_materials_select_member ON public.service_materials
  FOR SELECT TO authenticated
  USING ((SELECT private.can_access_service(service_id, ARRAY['ADMIN', 'BARBER', 'RECEPTIONIST']::text[])));
CREATE POLICY service_materials_insert_admin ON public.service_materials
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.can_access_service(service_id, ARRAY['ADMIN']::text[])));
CREATE POLICY service_materials_update_admin ON public.service_materials
  FOR UPDATE TO authenticated
  USING ((SELECT private.can_access_service(service_id, ARRAY['ADMIN']::text[])))
  WITH CHECK ((SELECT private.can_access_service(service_id, ARRAY['ADMIN']::text[])));
CREATE POLICY service_materials_delete_admin ON public.service_materials
  FOR DELETE TO authenticated
  USING ((SELECT private.can_access_service(service_id, ARRAY['ADMIN']::text[])));

CREATE POLICY clients_select_member ON public.clients
  FOR SELECT TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)));
CREATE POLICY clients_insert_member ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_organization_member(organization_id)));
CREATE POLICY clients_update_member ON public.clients
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)))
  WITH CHECK ((SELECT private.is_organization_member(organization_id)));
CREATE POLICY clients_delete_member ON public.clients
  FOR DELETE TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)));

CREATE POLICY appointments_select_member ON public.appointments
  FOR SELECT TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)));
CREATE POLICY appointments_insert_member ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_organization_member(organization_id)));
CREATE POLICY appointments_update_member ON public.appointments
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)))
  WITH CHECK ((SELECT private.is_organization_member(organization_id)));
CREATE POLICY appointments_delete_member ON public.appointments
  FOR DELETE TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)));

CREATE POLICY transactions_select_member ON public.transactions
  FOR SELECT TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)));
CREATE POLICY transactions_insert_member ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_organization_member(organization_id)));
CREATE POLICY transactions_update_member ON public.transactions
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)))
  WITH CHECK ((SELECT private.is_organization_member(organization_id)));
CREATE POLICY transactions_delete_member ON public.transactions
  FOR DELETE TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)));

CREATE POLICY transaction_items_select_member ON public.transaction_items
  FOR SELECT TO authenticated
  USING ((SELECT private.can_access_transaction(transaction_id)));
CREATE POLICY transaction_items_insert_member ON public.transaction_items
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.can_access_transaction(transaction_id)));
CREATE POLICY transaction_items_update_member ON public.transaction_items
  FOR UPDATE TO authenticated
  USING ((SELECT private.can_access_transaction(transaction_id)))
  WITH CHECK ((SELECT private.can_access_transaction(transaction_id)));
CREATE POLICY transaction_items_delete_member ON public.transaction_items
  FOR DELETE TO authenticated
  USING ((SELECT private.can_access_transaction(transaction_id)));

CREATE POLICY transaction_payments_select_member ON public.transaction_payments
  FOR SELECT TO authenticated
  USING ((SELECT private.can_access_transaction(transaction_id)));
CREATE POLICY transaction_payments_insert_member ON public.transaction_payments
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.can_access_transaction(transaction_id)));
CREATE POLICY inventory_movements_select_member ON public.inventory_movements
  FOR SELECT TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)));
CREATE POLICY inventory_movements_insert_member ON public.inventory_movements
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_organization_member(organization_id)));

CREATE POLICY daily_summaries_select_member ON public.daily_summaries
  FOR SELECT TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)));
CREATE POLICY daily_summaries_insert_admin ON public.daily_summaries
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_organization_role(organization_id, ARRAY['ADMIN']::text[])));
CREATE POLICY daily_summaries_update_admin ON public.daily_summaries
  FOR UPDATE TO authenticated
  USING ((SELECT private.has_organization_role(organization_id, ARRAY['ADMIN']::text[])))
  WITH CHECK ((SELECT private.has_organization_role(organization_id, ARRAY['ADMIN']::text[])));

CREATE POLICY audit_logs_select_member ON public.audit_logs
  FOR SELECT TO authenticated
  USING ((SELECT private.is_organization_member(organization_id)));
CREATE POLICY audit_logs_insert_member ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_organization_member(organization_id))
    AND user_id = (SELECT auth.uid())
  );

CREATE POLICY chat_messages_select_owner ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    (SELECT private.is_organization_member(organization_id))
    AND telegram_user_id = 'web_' || (SELECT auth.uid())::text
  );
CREATE POLICY chat_messages_insert_owner ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_organization_member(organization_id))
    AND telegram_user_id = 'web_' || (SELECT auth.uid())::text
  );
CREATE POLICY chat_messages_delete_owner ON public.chat_messages
  FOR DELETE TO authenticated
  USING (
    (SELECT private.is_organization_member(organization_id))
    AND telegram_user_id = 'web_' || (SELECT auth.uid())::text
  );

-- platform_admins no concede privilegios a anon/authenticated ni publica políticas.
-- Su lectura queda restringida a la DAL server-only autorizada en la etapa 02.
