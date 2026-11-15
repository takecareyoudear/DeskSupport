import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import jwt from 'jsonwebtoken';
import { registerAccounts } from '../src/accounts.js';
import { registerWorkspace } from '../src/workspace.js';
import { hashPassword } from '../src/security.js';

test('PostgreSQL migration, signup, username login and organization-scoped Master management',async t=>{
  const db=new PGlite();
  t.after(()=>db.close());
  const schema=readFileSync(new URL('../src/schema.sql',import.meta.url),'utf8');
  const migration=readFileSync(new URL('../src/organizations.sql',import.meta.url),'utf8');
  await db.exec(schema);
  const legacyId=randomUUID();
  const password='a sufficiently strong password';
  await db.query('INSERT INTO users(id,email,full_name,password_hash) VALUES($1,$2,$3,$4)',[legacyId,'legacy@example.com','Existing Owner',await hashPassword(password)]);
  await db.exec(migration);
  await db.exec(migration); // Safe on subsequent application startups.
  const legacy=(await db.query('SELECT * FROM users WHERE id=$1',[legacyId])).rows[0];
  assert.match(String(legacy.organization_id),/^[1-9][0-9]{5}$/);
  assert.equal(legacy.role,'admin');
  assert.match(legacy.username,/^user_/);
  const pool={
    async query(sql,params){const result=await db.query(sql,params);return {...result,rowCount:result.affectedRows??result.rows.length};},
    async connect(){return {query:this.query.bind(this),release(){}};},
  };
  const app=express();app.use(express.json());
  const secret='a-long-test-secret-for-registration-tokens';
  const origin='http://localhost:5173';
  const sessionCookie=req=>(req.headers.cookie||'').replace('session=','');
  await registerAccounts(app,{pool,cookieOptions:{path:'/api/auth'},sessionCookie,tokenSecret:secret});
  registerWorkspace(app,{pool,sessionCookie,origin});
  app.use((error,_req,res,_next)=>res.status(500).json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>server.close());
  async function request(path,body,cookie='',requestOrigin=origin){
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/auth/${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',origin:requestOrigin,cookie},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  async function token(email){
    const id=randomUUID();
    await db.query("INSERT INTO email_verifications(email,code_hash,expires_at,verified_at,registration_id) VALUES($1,'verified',now()+interval '10 minutes',now(),$2)",[email,id]);
    return jwt.sign({email,purpose:'register'},secret,{expiresIn:'15m',jwtid:id,issuer:'supportdesk',audience:'registration'});
  }
  const registrationToken=await token('owner@example.com');
  assert.equal((await request('register',{registrationToken,fullName:'New Owner',username:'bad username',password})).status,400);
  const registration=await request('register',{registrationToken,fullName:'New Owner',username:'owner',password});
  assert.equal(registration.status,201);
  assert.match(String(registration.body.organizationId),/^[1-9][0-9]{5}$/);
  assert.notEqual(registration.body.organizationId,legacy.organization_id);
  assert.equal((await request('register',{registrationToken,fullName:'New Owner',username:'another',password})).status,401,'verification is single use');
  const collisionToken=await token('collision@example.com');
  assert.equal((await request('register',{registrationToken:collisionToken,fullName:'Another Owner',username:'OWNER',password})).status,409);
  assert.equal((await db.query('SELECT * FROM organizations')).rows.length,2,'duplicate registration rolls back organization creation');
  const login=await request('login',{identifier:'OWNER',password});
  assert.equal(login.status,200);
  assert.equal(login.body.user.organizationId,registration.body.organizationId);
  assert.equal(login.body.user.username,'owner');
  assert.equal(login.body.user.password_hash,undefined);
  assert.equal((await request('login',{email:'owner@example.com',password})).status,200);
  assert.equal((await request('login',{identifier:'owner',password:'wrong'})).status,401);
  const cookie=login.cookie;
  assert.equal((await request('me',undefined,cookie)).body.user.organizationId,registration.body.organizationId);
  const base='workspace/masters';
  assert.equal((await request(base)).status,401);
  assert.equal((await request(`${base}/departments/create`,{name:'Denied'},cookie,'https://foreign.example')).status,403);
  const legacyLogin=await request('login',{email:'legacy@example.com',password});
  for(const kind of ['departments','categories','projects']){
    assert.equal((await request(`${base}/${kind}/create`,{name:'  '},cookie)).status,400);
    const created=await request(`${base}/${kind}/create`,{name:'  Operations  '},cookie);
    assert.equal(created.status,201);
    assert.equal(created.body.record.name,'Operations');
    const id=created.body.record.id;
    assert.equal((await request(`${base}/${kind}/create`,{name:'operations'},cookie)).status,409);
    assert.equal((await request(`${base}/${kind}/create`,{name:'Operations'},legacyLogin.cookie)).status,201,'names can repeat in another organization');
    assert.equal((await request(base,undefined,legacyLogin.cookie)).body[kind].some(row=>row.id===id),false);
    assert.equal((await request(`${base}/${kind}/update`,{id,name:'Stolen'},legacyLogin.cookie)).status,404);
    assert.equal((await request(`${base}/${kind}/delete`,{id},legacyLogin.cookie)).status,404);
    assert.equal((await request(`${base}/${kind}/update`,{id,name:'Updated'},cookie)).body.record.name,'Updated');
    await assert.rejects(db.query(`INSERT INTO ${kind}(id,organization_id,name) VALUES($1,999999,'Orphan')`,[randomUUID()]),error=>error.code==='23503','organization foreign key rejects orphan records');
    // A referencing module must restrict deletion rather than lose its Master link.
    await db.exec(`CREATE TABLE reference_${kind}(record_id uuid REFERENCES ${kind}(id) ON DELETE RESTRICT)`);
    await db.query(`INSERT INTO reference_${kind} VALUES($1)`,[id]);
    const restricted=await request(`${base}/${kind}/delete`,{id},cookie);
    assert.equal(restricted.status,409,JSON.stringify(restricted.body));
    await db.query(`DELETE FROM reference_${kind} WHERE record_id=$1`,[id]);
    assert.equal((await request(`${base}/${kind}/delete`,{id},cookie)).status,200);
  }
  const user=await request('workspace/users',{fullName:'Team Member',username:'teammate',email:'member@example.com',password,organizationId:legacy.organization_id,role:'member'},cookie);
  assert.equal(user.status,201);
  assert.equal(user.body.user.organizationId,registration.body.organizationId,'client cannot select another organization');
  assert.equal(user.body.user.role,'member','selected User level is stored');
  const member=await request('login',{identifier:'teammate',password});
  assert.equal(member.status,200);
  assert.equal((await request(base,undefined,member.cookie)).status,200);
  assert.equal((await request(`${base}/departments/create`,{name:'Unauthorized'},member.cookie)).status,403);
  assert.equal((await request('workspace/users',undefined,member.cookie)).status,403);
  assert.equal((await request('workspace/users',{fullName:'Fake Admin',username:'fakeadmin',email:'fake@example.com',password},member.cookie)).status,403);
  assert.equal((await request('workspace/users',{fullName:'Invalid Role',username:'invalidrole',email:'invalid@example.com',password,role:'owner'},cookie)).status,400);
  const delegated=await request('workspace/users',{fullName:'Second Admin',username:'secondadmin',email:'admin@example.com',password,role:'admin',organizationId:legacy.organization_id},cookie);
  assert.equal(delegated.status,201);
  assert.equal(delegated.body.user.role,'admin');
  assert.equal(delegated.body.user.organizationId,registration.body.organizationId);
  const adminLogin=await request('login',{identifier:'secondadmin',password});
  assert.equal((await request(`${base}/departments/create`,{name:'Admin managed'},adminLogin.cookie)).status,201);
  assert.equal((await request('workspace/users',{fullName:'Default User',username:'defaultuser',email:'default@example.com',password},adminLogin.cookie)).body.user.role,'member');
  assert.equal((await request('workspace/users',{fullName:'Escalation',username:'escalation',email:'escalation@example.com',password,role:'admin'},member.cookie)).status,403);
  assert.equal((await request('workspace/users',undefined,cookie)).body.users.length,4);
  await request('logout',{},cookie);
  assert.equal((await request(base,undefined,cookie)).status,401,'logout revokes workspace access');
});
