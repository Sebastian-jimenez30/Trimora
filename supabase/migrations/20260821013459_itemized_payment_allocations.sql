-- Distribucion auditable de cada entrada de dinero entre los items de una venta.
-- Migracion expand-only: no elimina ni modifica filas existentes.

CREATE UNIQUE INDEX transaction_items_transaction_id_uidx
  ON public.transaction_items(transaction_id, id);

CREATE UNIQUE INDEX transaction_payments_transaction_id_uidx
  ON public.transaction_payments(transaction_id, id);

CREATE TABLE public.transaction_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  transaction_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  transaction_item_id uuid NOT NULL,
  amount numeric(10, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transaction_payment_allocations_amount_check CHECK (amount > 0),
  CONSTRAINT transaction_payment_allocations_org_transaction_fk
    FOREIGN KEY (organization_id, transaction_id)
    REFERENCES public.transactions(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT transaction_payment_allocations_transaction_payment_fk
    FOREIGN KEY (transaction_id, payment_id)
    REFERENCES public.transaction_payments(transaction_id, id) ON DELETE CASCADE,
  CONSTRAINT transaction_payment_allocations_transaction_item_fk
    FOREIGN KEY (transaction_id, transaction_item_id)
    REFERENCES public.transaction_items(transaction_id, id) ON DELETE CASCADE,
  CONSTRAINT transaction_payment_allocations_payment_item_uidx
    UNIQUE (payment_id, transaction_item_id)
);

CREATE INDEX transaction_payment_allocations_org_transaction_idx
  ON public.transaction_payment_allocations(organization_id, transaction_id);

CREATE INDEX transaction_payment_allocations_item_idx
  ON public.transaction_payment_allocations(transaction_item_id);

ALTER TABLE public.transaction_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_payment_allocations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.transaction_payment_allocations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.transaction_payment_allocations TO service_role;
