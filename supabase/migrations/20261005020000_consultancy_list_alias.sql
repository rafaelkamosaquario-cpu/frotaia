-- Correct only the list branch: variable "o" conflicted with the table alias.
-- Preserve the original function's authorization, create/deliver behavior and grants.
begin;
do $migration$
declare definition text; original text; replacement text;
begin
 definition := pg_get_functiondef('public.consultancy_admin(text,jsonb)'::regprocedure);
 original := $old$select jsonb_agg(jsonb_build_object('company_id',o.company_id,'name',c.name,'client_email',o.client_email,
    'contact_name',o.contact_name,'delivered_at',o.delivered_at,'claimed_at',o.claimed_at,'consultant_until',o.consultant_until) order by o.created_at desc)
    from consultancy_onboardings o join companies c on c.id=o.company_id where o.consultant_id=uid$old$;
 replacement := $new$select jsonb_agg(jsonb_build_object('company_id',listing.company_id,'name',c.name,'client_email',listing.client_email,
    'contact_name',listing.contact_name,'delivered_at',listing.delivered_at,'claimed_at',listing.claimed_at,'consultant_until',listing.consultant_until) order by listing.created_at desc)
    from consultancy_onboardings listing join companies c on c.id=listing.company_id where listing.consultant_id=uid$new$;
 if position(original in definition)>0 then
   execute replace(definition,original,replacement);
 elsif position(replacement in definition)=0 then
   raise exception 'Unexpected consultancy_admin definition; no change applied';
 end if;
end $migration$;
commit;
