import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { initialState } from '../src/domain/catalog';
import { addPlate, createTicket, saveBuffet, saveGrill, saveWaste } from '../src/domain/actions';
import { stateChanges } from '../src/storage/supabase';
import type { State } from '../src/domain/model';

test('migrations PostgreSQL, persistência relacional, revisões e isolamento RLS',async()=>{
  const db=new PGlite();
  const member='00000000-0000-0000-0000-000000000001';
  const outsider='00000000-0000-0000-0000-000000000002';
  const at='2026-11-25T15:00:00.000Z';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $test$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $test$;
      insert into auth.users values ('${member}'),('${outsider}');`);
    for(const file of ['202611250001_analytics.sql','202611250002_repository.sql']) {
      await db.exec(await readFile(join(process.cwd(),'supabase','migrations',file),'utf8'));
    }
    await db.exec(`insert into bovinus.workspaces(id,nome) values
      ('00000000-0000-0000-0000-000000000003','Augusta'),
      ('00000000-0000-0000-0000-000000000004','Outro');
      insert into bovinus.membros values ('${member}','00000000-0000-0000-0000-000000000003'),
      ('${outsider}','00000000-0000-0000-0000-000000000004');
      set role authenticated; select set_config('request.jwt.claim.sub','${member}',false);`);
    const load=async()=>(await db.query<{state:State|null}>('select public.bovinus_load() as state')).rows[0].state;
    const commit=async(next:State,previous:State)=>(await db.query<{rev:number}>('select public.bovinus_commit($1,$2::jsonb) as rev',[previous.revision,JSON.stringify(stateChanges(next,previous))])).rows[0].rev;
    assert.equal(await load(),null);
    const base=initialState(false);
    assert.equal(await commit(base,{...base,foods:[],categories:[],settings:{...base.settings}}),1);
    const stored=(await load())!;
    const c=createTicket(stored,'0042',at);
    let s=addPlate(c.state,c.ticket.id,at).state;
    s=saveGrill(s,c.plate.id,[{foodId:'picanha',size:'media',count:2}],at);
    s=saveBuffet(s,c.plate.id,{weight:580,composition:'parcial',foodIds:['lasanha'],noMeat:false},at);
    s=saveWaste(s,c.plate.id,{at,note:'',outcomes:{lasanha:'grande',picanha:'nao_avaliado'}});
    assert.equal(await commit(s,stored),2);
    await assert.rejects(commit(s,stored),{code:'40001'});
    const roundTrip=(await load())!;
    assert.equal(roundTrip.tickets[0].number,'0042');
    assert.equal(roundTrip.plates.length,2);
    const p=roundTrip.plates.find(p=>p.id===c.plate.id)!;
    assert.equal(p.finance?.cost,13.32);
    assert.equal(p.financeHistory[0].finance.meatInputs?.[0].costKg,65);
    assert.equal(p.waste?.outcomes.lasanha,'grande');
    const corrected=saveBuffet(roundTrip,p.id,{weight:600,composition:'completa',foodIds:['lasanha'],noMeat:false},at);
    assert.equal(await commit(corrected,roundTrip),3);
    assert.equal((await load())?.plates.find(a=>a.id===p.id)?.financeHistory.length,2);
    assert.equal((await db.query('select id from public.comandas')).rows.length,1);
    await assert.rejects(db.exec("update public.comandas set numero='9999'"),{code:'42501'});
    await db.exec(`select set_config('request.jwt.claim.sub','${outsider}',false);`);
    assert.equal(await load(),null);
    assert.equal((await db.query('select id from public.comandas')).rows.length,0);
    await db.exec('reset role; set role anon;');
    await assert.rejects(load(),{code:'42501'});
  } finally { await db.close(); }
});
