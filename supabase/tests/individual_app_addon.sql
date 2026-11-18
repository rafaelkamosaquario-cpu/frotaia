-- Run after migration. All fixtures and simulated payments are rolled back.
begin;
do $$
declare c uuid:=gen_random_uuid(); a jsonb; b jsonb;
begin
 insert into companies(id,name) values(c,'TESTE TRANSACIONAL ADICIONAL - ROLLBACK');
 insert into subscriptions(company_id,plan,status,valido_ate) values(c,'INDIVIDUAL_MENSAL','ATIVA',now()+interval '1 year');
 a:=confirm_individual_app_payment(c,'mercadopago','999999999999999999990001',990,now());
 b:=confirm_individual_app_payment(c,'mercadopago','999999999999999999990001',990,now());
 if a->>'id'<>b->>'id' or a->>'access_until'<>b->>'access_until' then raise exception 'Replay extended access';end if;
 if (select count(*) from individual_app_payments where company_id=c)<>1 then raise exception 'Duplicate';end if;
 perform confirm_individual_app_payment(c,'mercadopago','999999999999999999990001',990,now(),'refunded');
 perform confirm_individual_app_payment(c,'mercadopago','999999999999999999990001',990,now(),'approved');
 if (individual_app_state(c)->>'until') is not null then raise exception 'Refund resurrected';end if;
 if (select status::text from subscriptions where company_id=c)<>'ATIVA' then raise exception 'Base modified';end if;
 if has_function_privilege('authenticated','public.confirm_individual_app_payment(uuid,text,text,integer,timestamptz,text,uuid,text)','EXECUTE') then raise exception 'Browser can grant access';end if;
end $$;
rollback;
