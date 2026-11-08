-- Extend only the receipt-reference validation. Preserve authorization, locks,
-- prices, idempotency, grants and all existing receipts/subscriptions.
begin;
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.confirm_direct_pix(uuid,uuid,uuid,text,text,text,integer,timestamptz)'::regprocedure) into definition;
 if position('^[0-9]{6,30}$' in definition)>0 then
  definition := replace(definition, '^[0-9]{6,30}$', '^([0-9]{6,30}|E[0-9]{16}[A-Z0-9]{15})$');
  execute definition;
 elsif position('^([0-9]{6,30}|E[0-9]{16}[A-Z0-9]{15})$' in definition)=0 then
  raise exception 'Unexpected Pix validation; migration not applied';
 end if;
end $migration$;
commit;
