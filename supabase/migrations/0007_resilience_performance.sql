-- Etapa 08: indices compuestos para cobros FIFO y trazabilidad multiempresa.
-- La migracion es aditiva y no elimina ni reescribe datos existentes.

CREATE INDEX IF NOT EXISTS transactions_org_client_type_status_created_id_idx
  ON public.transactions (organization_id, client_id, type, status, created_at, id);

CREATE INDEX IF NOT EXISTS inventory_movements_org_transaction_idx
  ON public.inventory_movements (organization_id, transaction_id);
