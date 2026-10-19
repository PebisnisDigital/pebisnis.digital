create index if not exists purchase_orders_latest_payment_proof_idx
  on public.purchase_orders(latest_payment_proof_id)
  where latest_payment_proof_id is not null;
