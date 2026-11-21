import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {PGlite} from '@electric-sql/pglite';
import {registerWorkspace} from '../src/workspace.js';
import {sessionHash} from '../src/security.js';

test('ticket history survives reassignment and stays within the organization', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  for (const name of ['schema','organizations','roles']) {
    await db.exec(readFileSync(new URL(`../src/${name}.sql`,import.meta.url),'utf8'));
  }
  const migration = readFileSync(new URL('../src/tickets.sql',import.meta.url),'utf8');
  const legacyMigration = migration.replace(/^ALTER TABLE tickets DROP CONSTRAINT.*\r?\n/gm,'')
    .replace('due_date date NOT NULL,','due_date date NOT NULL CHECK (due_date >= entered_date),')
    .replace('reminder_date date NOT NULL,','reminder_date date NOT NULL CHECK (reminder_date BETWEEN entered_date AND due_date),');
  await db.exec(legacyMigration);
  await db.exec(migration);
  await db.exec(migration);
  await db.exec('INSERT INTO organizations(id) VALUES(100000),(100001)');
  const origin = 'http://localhost:5173';
  async function account(name, role, org = 100000) {
    const id = randomUUID();
    await db.query('INSERT INTO users(id,email,full_name,password_hash,username,organization_id,role) VALUES($1,$2,$3,$4,$3,$5,$6)',[id,`${name}@test.example`,name,'unused',org,role]);
    await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[sessionHash(name),id]);
    return {id,name};
  }
  const admin = await account('owner','admin');
  const first = await account('first','member');
  const second = await account('second','member');
  const outsider = await account('outsider','admin',100001);
  const pool = {query:db.query.bind(db), connect:async () => ({query:db.query.bind(db),release(){}})};
  const app = express();
  app.use(express.json());
  registerWorkspace(app,{pool,origin,sessionCookie:req=>req.get('x-session')});
  const server = app.listen(0,'127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  t.after(() => server.close());
  async function request(actor,path='',body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/workspace/tickets${path}`, {
      method: body ? 'POST' : 'GET', headers:{origin,'x-session':actor.name,'content-type':'application/json'},
      body:JSON.stringify(body)
    });
    return {status:response.status, data:await response.json()};
  }
  const details = {title:'Printer offline',description:'Reception printer',assignee_id:first.id,priority:'High',
    entered_date:'2026-11-21',reminder_date:'2035-12-01',due_date:'2035-11-24'};
  for (const [key,table] of [['department_id','departments'],['category_id','categories'],['project_id','projects']]) {
    details[key] = randomUUID();
    await db.query(`INSERT INTO ${table}(id,organization_id,name) VALUES($1,100000,$2)`,[details[key],table]);
  }
  assert.equal((await request(first,'',details)).status,403);
  assert.equal((await request(admin,'',{...details,assignee_id:outsider.id})).status,400);
  assert.equal((await request(admin,'',{...details,reminder_date:'2035-02-30'})).status,400);
  const created = await request(admin,'',details);
  assert.equal(created.status,201);
  const path = `/${created.data.id}`;
  assert.equal((await request(first)).data.tickets.length,1);
  assert.equal((await request(second,path)).status,404);
  assert.equal((await request(outsider,path)).status,404);
  assert.equal((await request(first,`${path}/feedback`,{feedback:'Checked the printer.'})).status,200);
  assert.equal((await request(first,`${path}/update`,{...details,revision:1,assignee_id:second.id,priority:'Medium'})).status,200);
  assert.equal((await request(first,`${path}/feedback`,{feedback:'Old assignment'})).status,404);
  assert.equal((await request(admin,`${path}/update`,{...details,revision:1})).status,409);
  assert.equal((await request(first)).data.tickets.length,0);
  assert.equal((await request(second)).data.tickets.length,1);
  assert.equal((await request(second,`${path}/feedback`,{feedback:'I will follow up.'})).status,200);
  const {ticket,events} = (await request(second,path)).data;
  assert.equal(ticket.reminder_date,details.reminder_date);
  assert.equal(ticket.due_date,details.due_date);
  assert.equal(ticket.priority,'Medium');
  assert.deepEqual(events.map(event=>event.actor_id),[admin.id,first.id,first.id,second.id]);
  assert.match(events[2].body,/Assignee: first . second/);
  assert.match(events[2].body,/Priority: High . Medium/);
  assert.equal(events[3].body,'I will follow up.');
});
