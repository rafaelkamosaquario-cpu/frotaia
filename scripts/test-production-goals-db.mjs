import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
try {
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth; create function auth.uid() returns uuid language sql as $$select current_setting('test.actor')::uuid$$;
 create type company_member_role as enum ('owner','admin','operator','viewer','driver');
 create table companies(id uuid primary key);
 create table vehicles(id uuid primary key,company_id uuid references companies(id),unique(id,company_id));
 create table company_members(company_id uuid,user_id uuid,role company_member_role,allowed boolean default true);
 create function is_company_member(c uuid) returns boolean language sql security definer set search_path=public as $$select exists(select 1 from company_members where company_id=c and user_id=auth.uid() and allowed)$$;
 create function has_company_role(c uuid,r company_member_role[]) returns boolean language sql security definer set search_path=public as $$select exists(select 1 from company_members where company_id=c and user_id=auth.uid() and role=any(r) and allowed)$$;
 grant usage on schema public,auth to authenticated;`);
 await db.exec(await readFile('supabase/migrations/20261005010000_monthly_production_goals.sql','utf8'));
 const a=crypto.randomUUID(), b=crypto.randomUUID(), av=crypto.randomUUID(), bv=crypto.randomUUID(), owner=crypto.randomUUID(), viewer=crypto.randomUUID(), other=crypto.randomUUID();
 await db.query('insert into companies values($1),($2)',[a,b]);
 await db.query('insert into vehicles values($1,$2),($3,$4)',[av,a,bv,b]);
 await db.query("insert into company_members values($1,$2,'owner',true),($1,$3,'viewer',true),($4,$5,'admin',true)",[a,owner,viewer,b,other]);
 const actor=async id=>db.exec(`reset role; set test.actor='${id}'; set role authenticated;`);
 const insert=(company,vehicle)=>db.query("insert into fleet_monthly_production(company_id,vehicle_id,month,operation,target_tonnes,actual_tonnes,measured_through) values($1,$2,'2026-09','transporte',850,336.760,'2026-09-30')",[company,vehicle]);
 await actor(owner); await insert(a,av);
 await assert.rejects(insert(a,av)); // duplicate
 await assert.rejects(insert(a,bv)); // composite FK
 await assert.rejects(insert(b,bv)); // cross-company RLS
 await assert.rejects(db.exec("update fleet_monthly_production set actual_tonnes=-1"));
 await assert.rejects(db.exec("update fleet_monthly_production set measured_through='2026-08-30'"));
 await assert.rejects(db.exec("update fleet_monthly_production set month='2026-10'"));
 await assert.rejects(db.exec('delete from fleet_monthly_production'));
 const update=await db.query('update fleet_monthly_production set actual_tonnes=400 where revision=1 returning revision');
 assert.equal(update.rows[0].revision,2);
 assert.equal((await db.query('update fleet_monthly_production set actual_tonnes=500 where revision=1 returning revision')).rows.length,0);
 await actor(other); assert.equal((await db.query('select * from fleet_monthly_production')).rows.length,0);
 await actor(viewer); assert.equal((await db.query('select * from fleet_monthly_production')).rows.length,1);
 assert.equal((await db.query('update fleet_monthly_production set actual_tonnes=0 returning *')).rows.length,0);
 await assert.rejects(insert(a,av));
 await db.exec('reset role'); await db.query('update company_members set allowed=false where user_id=$1',[owner]);
 await actor(owner); assert.equal((await db.query('select * from fleet_monthly_production')).rows.length,0);
 await assert.rejects(insert(a,av));
 console.log('PASS: migration, constraints, tenant isolation, reader permissions, expired access, revision conflict, no delete grant.');
} finally { await db.close(); }
