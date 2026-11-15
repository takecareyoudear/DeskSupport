import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {nextDueDate,validPayableSchedule} from '../src/payable-schedules.js';
const schedule=(frequency,day=null,month=null,weekday=null)=>({frequency,due_day:day,due_month:month,due_weekday:weekday});
test('payable schedules use weekday, monthly day, or yearly month/day with calendar rollovers',()=>{
 assert.equal(nextDueDate(schedule('weekly',null,null,1),'2026-11-15'),'2026-11-16');
 assert.equal(nextDueDate(schedule('weekly',null,null,0),'2026-11-15'),'2026-11-15');
 assert.equal(nextDueDate(schedule('weekly',null,null,1),'2026-11-17'),'2026-11-23');
 assert.equal(nextDueDate(schedule('weekly',null,null,1),'2027-01-01'),'2027-01-04');
 assert.equal(nextDueDate(schedule('monthly',31),'2026-02-01'),'2026-02-28');
 assert.equal(nextDueDate(schedule('monthly',31),'2026-03-01'),'2026-03-31');
 assert.equal(nextDueDate(schedule('monthly',1),'2026-12-02'),'2027-01-01');
 assert.equal(nextDueDate(schedule('yearly',29,2),'2027-01-01'),'2027-02-28');
 assert.equal(nextDueDate(schedule('yearly',29,2),'2028-01-01'),'2028-02-29');
 assert.equal(nextDueDate(schedule('yearly',10,1),'2026-11-15'),'2027-01-10');
 assert.equal(validPayableSchedule('weekly',null,null,7),false);
 assert.equal(validPayableSchedule('weekly',null,1,0),false);
 assert.equal(validPayableSchedule('yearly',2,30,null),false);
 assert.equal(validPayableSchedule('monthly',null,0,null),false);
});
test('payable migration preserves existing bills and converts full dates to schedules',async()=>{
 const db=new PGlite();
 try{
  await db.exec('CREATE TABLE organizations(id integer PRIMARY KEY); INSERT INTO organizations VALUES(123456);');
  const migration=readFileSync(new URL('../src/payables.sql',import.meta.url),'utf8');
  await db.exec(migration.split('ALTER TABLE payables')[0]+'COMMIT;');
  for(const [id,frequency,date] of [['00000000-0000-0000-0000-000000000001','weekly','2026-11-15'],['00000000-0000-0000-0000-000000000002','monthly','2026-01-31'],['00000000-0000-0000-0000-000000000003','yearly','2026-12-15']])await db.query("INSERT INTO payables(id,organization_id,name,amount,currency,frequency,first_due_date,remarks) VALUES($1,123456,$2,100.25,'INR',$2,$3,'Existing remarks')",[id,frequency,date]);
  await db.exec(migration);await db.exec(migration);
  const rows=(await db.query('SELECT * FROM payables ORDER BY id')).rows;
  assert.equal(rows[0].due_weekday,0);assert.equal(rows[0].due_day,null);
  assert.equal(rows[1].due_day,31);assert.equal(rows[1].due_month,null);
  assert.equal(rows[2].due_day,15);assert.equal(rows[2].due_month,12);
  assert.equal(Number(rows[2].amount),100.25);assert.equal(rows[2].remarks,'Existing remarks');
 }finally{await db.close();}
});
