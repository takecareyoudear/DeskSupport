import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {canAccess,ROLE_MENU_IDS} from '../src/menu-catalog.js';
import {menuAccess} from '../src/roles.js';
test('menu visibility includes permitted parents and excludes siblings, unknown and admin-only menus',()=>{
 const user={role:'member',menus:['assets.categories','company']};
 assert.equal(canAccess(user,'assets'),true);
 assert.equal(canAccess(user,'assets.categories'),true);
 assert.equal(canAccess(user,'assets.register'),false);
 assert.equal(canAccess(user,'payble'),false);
 assert.equal(canAccess(user,'settings'),false);
 assert.equal(canAccess({role:'member'},'payble'),false);
 assert.equal(canAccess({role:'admin'},'settings.roles'),true);
});
test('role migration preserves existing user access once and enforces organization-scoped assignment',async()=>{
 const db=new PGlite();
 try{
  await db.exec(readFileSync(new URL('../src/schema.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../src/organizations.sql',import.meta.url),'utf8'));
  await db.exec("INSERT INTO organizations(id) VALUES(123456),(123457); INSERT INTO users(id,email,full_name,password_hash,username,organization_id,role) VALUES('00000000-0000-0000-0000-000000000001','member@example.com','Existing User','hash','existing',123456,'member')");
  const migration=readFileSync(new URL('../src/roles.sql',import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration);
  const member=(await db.query("SELECT * FROM users WHERE username='existing'")).rows[0];
  assert.ok(member.menu_role_id);
  const access=await menuAccess(db,member);
  assert.deepEqual([...access.access_menus].sort(),[...ROLE_MENU_IDS].sort());
  await assert.rejects(db.query("INSERT INTO users(id,email,full_name,password_hash,username,organization_id,role,menu_role_id) VALUES('00000000-0000-0000-0000-000000000002','other@example.com','Other User','hash','other',123457,'member',$1)",[member.menu_role_id]),error=>error.code==='23503');
  await db.query('UPDATE users SET menu_role_id=NULL WHERE id=$1',[member.id]);
  await db.exec(migration);
  assert.equal((await db.query('SELECT menu_role_id FROM users WHERE id=$1',[member.id])).rows[0].menu_role_id,null,'restarting does not restore revoked access');
  assert.deepEqual((await menuAccess(db,{...member,menu_role_id:null})).access_menus,[]);
 }finally{await db.close();}
});
