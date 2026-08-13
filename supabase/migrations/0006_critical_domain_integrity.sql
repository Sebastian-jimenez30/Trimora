-- Etapa 05: trazabilidad de inventario y total gastado derivado del libro de ventas.
-- Esta migracion es aditiva: no elimina clientes, ventas, abonos ni movimientos.

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS transaction_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_org_id_uidx
  ON public.transactions (organization_id, id);

-- Recuperar el vinculo de movimientos historicos creados por la aplicacion anterior.
UPDATE public.inventory_movements AS movement
SET transaction_id = tx.id
FROM public.transactions AS tx
WHERE movement.transaction_id IS NULL
  AND movement.organization_id = tx.organization_id
  AND movement.notes ~* 'transaction [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
  AND tx.id = substring(
    movement.notes
    FROM '(?i)transaction ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'
  )::uuid;

-- La migracion inicial creo esta relacion con ON DELETE NO ACTION. La
-- restriccion compuesta de abajo reemplaza esa relacion y conserva, ademas,
-- el aislamiento por organizacion.
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_transaction_id_transactions_id_fk;

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_transaction_fk;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_movements_org_transaction_fk'
      AND conrelid = 'public.inventory_movements'::regclass
  ) THEN
    ALTER TABLE public.inventory_movements
      ADD CONSTRAINT inventory_movements_org_transaction_fk
      FOREIGN KEY (organization_id, transaction_id)
      REFERENCES public.transactions (organization_id, id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS inventory_movements_transaction_idx
  ON public.inventory_movements (transaction_id);

-- Reconciliar el acumulado existente antes de mantenerlo automaticamente.
UPDATE public.clients AS client
SET total_spent = COALESCE((
  SELECT sum(tx.total_amount)
  FROM public.transactions AS tx
  WHERE tx.organization_id = client.organization_id
    AND tx.client_id = client.id
    AND tx.type = 'INCOME'
    AND tx.status <> 'REFUNDED'
), 0);

CREATE OR REPLACE FUNCTION private.maintain_client_total_spent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  old_client_id uuid;
  old_organization_id uuid;
  old_amount numeric(10, 2) := 0;
  new_client_id uuid;
  new_organization_id uuid;
  new_amount numeric(10, 2) := 0;
BEGIN
  IF TG_OP <> 'INSERT'
    AND OLD.client_id IS NOT NULL
    AND OLD.type = 'INCOME'
    AND OLD.status <> 'REFUNDED'
  THEN
    old_client_id := OLD.client_id;
    old_organization_id := OLD.organization_id;
    old_amount := OLD.total_amount;
  END IF;

  IF TG_OP <> 'DELETE'
    AND NEW.client_id IS NOT NULL
    AND NEW.type = 'INCOME'
    AND NEW.status <> 'REFUNDED'
  THEN
    new_client_id := NEW.client_id;
    new_organization_id := NEW.organization_id;
    new_amount := NEW.total_amount;
  END IF;

  UPDATE public.clients AS client
  SET total_spent = greatest(
    0,
    COALESCE(client.total_spent, 0)
      - CASE
          WHEN client.id = old_client_id
            AND client.organization_id = old_organization_id
          THEN old_amount
          ELSE 0
        END
      + CASE
          WHEN client.id = new_client_id
            AND client.organization_id = new_organization_id
          THEN new_amount
          ELSE 0
        END
  )
  WHERE (client.id = old_client_id AND client.organization_id = old_organization_id)
     OR (client.id = new_client_id AND client.organization_id = new_organization_id);

  RETURN NULL;
END
$function$;

DROP TRIGGER IF EXISTS transactions_client_total_spent ON public.transactions;
CREATE TRIGGER transactions_client_total_spent
  AFTER INSERT OR DELETE OR UPDATE OF organization_id, client_id, type, total_amount, status
  ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION private.maintain_client_total_spent();

REVOKE ALL ON FUNCTION private.maintain_client_total_spent() FROM PUBLIC, anon, authenticated;
