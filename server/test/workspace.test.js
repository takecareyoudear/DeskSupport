import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import jwt from 'jsonwebtoken';
import { registerAccounts } from '../src/accounts.js';
import { registerAssets } from '../src/assets.js';
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
  const assetMigration=readFileSync(new URL('../src/assets.sql',import.meta.url),'utf8');
  await db.exec(assetMigration);await db.exec(assetMigration);
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
  registerAssets(app,{pool});
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


  const assetBase='workspace/assets';
  assert.equal((await request(assetBase)).status,401);
  assert.equal((await request(assetBase,undefined,member.cookie)).status,200);
  const carCategory={name:'Car / Bike',asset_type:'movable',is_subscription:false};
  assert.equal((await request(`${assetBase}/categories/create`,carCategory,member.cookie)).status,403);
  assert.equal((await request(`${assetBase}/categories/create`,carCategory,cookie,'https://foreign.example')).status,403);
  const category=await request(`${assetBase}/categories/create`,carCategory,cookie);
  assert.equal(category.status,201,JSON.stringify(category.body));
  const categoryId=category.body.record.id;
  assert.equal((await request(`${assetBase}/categories/create`,{...carCategory,name:'car / bike'},cookie)).status,409);
  assert.equal((await request(`${assetBase}/categories/create`,{...carCategory,asset_type:'physical'},cookie)).status,400);
  const building=await request(`${assetBase}/categories/create`,{name:'Building',asset_type:'immovable',is_subscription:false},cookie);
  const subscriptionCategory=await request(`${assetBase}/categories/create`,{name:'Subscription',asset_type:'virtual',is_subscription:true},cookie);
  assert.equal(building.status,201);assert.equal(subscriptionCategory.status,201);
  const assetBody={name:'Company car',asset_type:'movable',category_id:categoryId,insurer:'Insurance Co',policy_number:'CAR-001',notes:'Company vehicle\nParked at the main office'};
  const asset=await request(`${assetBase}/assets/create`,assetBody,cookie);
  assert.equal(asset.status,201,JSON.stringify(asset.body));
  const assetId=asset.body.record.id;
  assert.equal(asset.body.record.notes,assetBody.notes);
  assert.equal(asset.body.record.policy_number,'CAR-001');
  assert.equal((await request(`${assetBase}/assets/create`,{...assetBody,name:'Mismatch',asset_type:'immovable'},cookie)).status,400);
  assert.equal((await request(`${assetBase}/categories/update`,{...carCategory,id:categoryId,asset_type:'virtual'},cookie)).status,409);
  assert.equal((await request(`${assetBase}/categories/update`,{...carCategory,id:categoryId,is_subscription:true},cookie)).status,409);
  for(const invalid of [{end_date:'2026-02-30'},{category_id:'invalid'},{notes:'x'.repeat(2001)}])assert.equal((await request(`${assetBase}/assets/create`,{...assetBody,...invalid},cookie)).status,400);
  const foreignCategory=await request(`${assetBase}/categories/create`,carCategory,legacyLogin.cookie);
  assert.equal((await request(`${assetBase}/assets/create`,{...assetBody,category_id:foreignCategory.body.record.id},cookie)).status,400);
  assert.equal((await request(assetBase,undefined,legacyLogin.cookie)).body.assets.length,0);
  for(const [kind,id,payload] of [['categories',categoryId,{...carCategory,name:'Cars'}],['assets',assetId,{...assetBody,name:'Updated car'}]]){
   assert.equal((await request(`${assetBase}/${kind}/update`,{...payload,id},legacyLogin.cookie)).status,404);
   assert.equal((await request(`${assetBase}/${kind}/delete`,{id},legacyLogin.cookie)).status,404);
   assert.equal((await request(`${assetBase}/${kind}/update`,{...payload,id},cookie)).status,200);
  }
  assert.equal((await request(`${assetBase}/categories/delete`,{id:categoryId},cookie)).status,409);
  const subscription={name:'Office software',asset_type:'virtual',category_id:subscriptionCategory.body.record.id,notes:'Annual license\nRenew through vendor'};
  assert.equal((await request(`${assetBase}/assets/create`,subscription,cookie)).status,400,'subscription dates required');
  assert.equal((await request(`${assetBase}/assets/create`,{...subscription,end_date:'2026-12-31'},cookie)).status,400,'renewal required');
  const subscribed=await request(`${assetBase}/assets/create`,{...subscription,end_date:'2026-12-31',renewal_date:'2026-12-15'},cookie);
  assert.equal(subscribed.status,201);
  const inventory=(await request(assetBase,undefined,member.cookie)).body;
  assert.equal(inventory.assets.find(row=>row.id===assetId).notes,assetBody.notes);
  assert.equal(inventory.assets.find(row=>row.id===subscribed.body.record.id).end_date.slice(0,10),'2026-12-31');
  assert.equal((await request(`${assetBase}/assets/delete`,{id:subscribed.body.record.id},cookie)).status,200);
  assert.equal((await request(`${assetBase}/assets/delete`,{id:assetId},cookie)).status,200);
  assert.equal((await request(`${assetBase}/categories/delete`,{id:categoryId},cookie)).status,200);
  const editPath=`workspace/users/${user.body.user.id}/update`;
  const changes={fullName:'Updated Member',role:'admin',password:''};
  assert.equal((await request(editPath,changes,member.cookie)).status,403);
  assert.equal((await request(editPath,changes,legacyLogin.cookie)).status,404);
  assert.equal((await request(editPath,changes,cookie,'https://foreign.example')).status,403);
  for(const invalid of [{fullName:'x'},{role:'owner'},{password:'short'},{password:123},{username:'changed'},{email:'changed@example.com'}]){
    assert.equal((await request(editPath,{...changes,...invalid},cookie)).status,400);
  }
  const updated=await request(editPath,changes,cookie);
  assert.equal(updated.status,200);
  assert.equal(updated.body.user.fullName,'Updated Member');
  assert.equal(updated.body.user.role,'admin');
  assert.equal(updated.body.user.username,'teammate');
  assert.equal(updated.body.user.email,'member@example.com');
  assert.equal(updated.body.user.password_hash,undefined);
  assert.equal((await request('workspace/users',undefined,member.cookie)).status,200,'role changes apply to existing sessions');
  assert.equal((await request('login',{identifier:'teammate',password})).status,200,'blank password keeps old password');
  assert.equal((await request(editPath,{fullName:'Updated Member',role:'member'},cookie)).status,200);
  assert.equal((await request('workspace/users',undefined,member.cookie)).status,403,'demotion applies immediately');
  const newPassword='a replacement secure password';
  await db.query("INSERT INTO password_resets(email,code_hash,expires_at) VALUES('member@example.com','old-code',now()+interval '10 minutes')");
  assert.equal((await request(editPath,{fullName:'Renamed Member',role:'member',password:newPassword},cookie)).status,200);
  assert.equal((await request('me',undefined,member.cookie)).status,401,'password update revokes sessions');
  assert.equal((await request('login',{identifier:'teammate',password})).status,401);
  assert.equal((await request('login',{identifier:'teammate',password:newPassword})).status,200);
  assert.equal((await db.query("SELECT * FROM password_resets WHERE email='member@example.com'")).rows.length,0);
  assert.equal((await request(`workspace/users/${legacyId}/update`,{fullName:'Legacy Owner',role:'member'},legacyLogin.cookie)).status,409,'last admin cannot be demoted');
  await request('logout',{},cookie);
  assert.equal((await request(base,undefined,cookie)).status,401,'logout revokes workspace access');
});


test('asset migration preserves legacy assets, categories, insurance and remarks',async()=>{
 const db=new PGlite();
 try{
  await db.exec(readFileSync(new URL('../src/schema.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../src/organizations.sql',import.meta.url),'utf8'));
  const migration=readFileSync(new URL('../src/assets.sql',import.meta.url),'utf8');
  await db.exec(migration.split('-- Preserve existing records')[0]+'COMMIT;');
  await db.exec("INSERT INTO organizations(id) VALUES(123456)");
  const typeId=randomUUID(),categoryId=randomUUID(),assetId=randomUUID();
  await db.query("INSERT INTO asset_types VALUES($1,123456,'Property','immovable')",[typeId]);
  await db.query("INSERT INTO asset_categories VALUES($1,123456,'Home','physical','building')",[categoryId]);
  await db.query("INSERT INTO assets(id,organization_id,name,type_id,category_id,insurer,notes) VALUES($1,123456,'Existing home',$2,$3,'Existing insurer','Line one\nLine two')",[assetId,typeId,categoryId]);
  await db.exec(migration);await db.exec(migration);
  const asset=(await db.query('SELECT * FROM assets WHERE id=$1',[assetId])).rows[0];
  assert.equal(asset.asset_type,'immovable');
  assert.equal(asset.insurer,'Existing insurer');
  assert.equal(asset.notes,'Line one\nLine two');
  assert.equal((await db.query('SELECT asset_type FROM asset_categories WHERE id=$1',[categoryId])).rows[0].asset_type,'immovable');
 }finally{await db.close();}
});
