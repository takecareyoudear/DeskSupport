import {menuAccess,validMenuRole} from './roles.js';
import {canAccess} from './menu-catalog.js';
import { randomUUID } from 'node:crypto';
import { hashPassword, sessionHash } from './security.js';
import { registerTickets } from './tickets.js';

export const validUsername = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_.]{2,39}$/.test(value);
export const publicUser = user => ({id:user.id,email:user.email,fullName:user.full_name,username:user.username,organizationId:user.organization_id,role:user.role,menuRoleId:user.menu_role_id||null,menus:user.access_menus||[]});
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const tables = new Set(['departments','categories','projects']);

export function registerWorkspace(app,{pool,sessionCookie,origin}) {
  const base='/api/auth/workspace';
  app.use(base,async(req,res,next)=>{
    if(req.method!=='GET' && req.get('origin')!==origin) return res.status(403).json({error:'Request origin is not allowed.'});
    const {rows}=await pool.query('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',[sessionHash(sessionCookie(req))]);
    if(!rows[0])return res.status(401).json({error:'Please log in.'});
    req.account=await menuAccess(pool,rows[0]);
    if(req.path.split('/')[1]==='tickets')return next();
    if(req.account.role!=='admin'){
      const path=req.path.split('/').filter(Boolean);
      const menu=path[0]==='masters'?'settings.master':path[0]==='payables'?'payble':path[0]==='assets'?(path.length===1?'assets':path[1]==='categories'?'assets.categories':'assets.register'):null;
      if(!menu||!canAccess({...req.account,menus:req.account.access_menus},menu))return res.status(403).json({error:'Your assigned role does not allow this menu.'});
    }
    if(req.method!=='GET' && req.account.role!=='admin')return res.status(403).json({error:'Only organization admins can make changes.'});
    next();
  });
  registerTickets(app,{pool});
  app.get(`${base}/masters`,async(req,res)=>{
    const result={};
    for(const table of tables) result[table]=(await pool.query(`SELECT id,name FROM ${table} WHERE organization_id=$1 ORDER BY lower(name),id`,[req.account.organization_id])).rows;
    res.json(result);
  });
  app.post(`${base}/masters/:kind/:action`,async(req,res)=>{
    const {kind,action}=req.params;
    if(!tables.has(kind)||!['create','update','delete'].includes(action))return res.status(404).json({error:'Unknown Master operation.'});
    const name=typeof req.body.name==='string'?req.body.name.trim():'';
    if(action!=='create'&&!uuid(req.body.id))return res.status(400).json({error:'Choose a valid record.'});
    if(action!=='delete'&&(!name||name.length>100))return res.status(400).json({error:'Enter a name of 1-100 characters.'});
    const organization=req.account.organization_id;
    try {
      let result;
      if(action==='create')result=await pool.query(`INSERT INTO ${kind}(id,organization_id,name) VALUES($1,$2,$3) RETURNING id,name`,[randomUUID(),organization,name]);
      if(action==='update')result=await pool.query(`UPDATE ${kind} SET name=$3 WHERE id=$1 AND organization_id=$2 RETURNING id,name`,[req.body.id,organization,name]);
      if(action==='delete')result=await pool.query(`DELETE FROM ${kind} WHERE id=$1 AND organization_id=$2 RETURNING id`,[req.body.id,organization]);
      if(!result.rowCount)return res.status(404).json({error:'Record not found in your organization.'});
      res.status(action==='create'?201:200).json({record:result.rows[0]});
    } catch(error) {
      if(error.code==='23505')return res.status(409).json({error:'A record with that name already exists.'});
      if(error.code==='23503'||error.code==='23001')return res.status(409).json({error:'This record is in use and cannot be deleted.'});
      throw error;
    }
  });
  app.get(`${base}/users`,async(req,res)=>{
    if(req.account.role!=='admin')return res.status(403).json({error:'Only organization admins can manage users.'});
    const {rows}=await pool.query('SELECT id,email,full_name,username,organization_id,role,menu_role_id FROM users WHERE organization_id=$1 ORDER BY full_name,id',[req.account.organization_id]);
    res.json({users:rows.map(publicUser)});
  });
  app.post(`${base}/users`,async(req,res)=>{
    const username=typeof req.body.username==='string'?req.body.username.trim().toLowerCase():'';
    const email=typeof req.body.email==='string'?req.body.email.trim().toLowerCase():'';
    const fullName=typeof req.body.fullName==='string'?req.body.fullName.trim():'';
    const password=req.body.password;
    const role=req.body.role===undefined?'member':req.body.role;
    if(!['member','admin'].includes(role))return res.status(400).json({error:'Choose User or Admin as the user level.'});
    if(!validUsername(username)||email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||fullName.length<2||fullName.length>100||typeof password!=='string'||password.length<12||password.length>128)
      return res.status(400).json({error:'Enter a full name, username (3-40 letters, numbers, dots or underscores), valid email and password (12-128 characters).'});
    if(!await validMenuRole(pool,req.body.menuRoleId,req.account.organization_id))return res.status(400).json({error:'Choose a menu role from your organization.'});
    try {
      const {rows}=await pool.query('INSERT INTO users(id,email,full_name,password_hash,username,organization_id,role,menu_role_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,email,full_name,username,organization_id,role,menu_role_id',[randomUUID(),email,fullName,await hashPassword(password),username,req.account.organization_id,role,req.body.menuRoleId||null]);
      res.status(201).json({user:publicUser(rows[0])});
    } catch(error) {
      if(error.code==='23505')return res.status(409).json({error:'Email or username already exists.'});
      if(error.code==='23503')return res.status(409).json({error:'The selected menu role no longer exists. Reload and choose another.'});
      throw error;
    }
  });
  app.post(`${base}/users/:id/update`,async(req,res)=>{
    const fullName=typeof req.body.fullName==='string'?req.body.fullName.trim():'';
    const {role,password}=req.body;
    if(!uuid(req.params.id)||fullName.length<2||fullName.length>100||!['member','admin'].includes(role)||
      (password!==undefined && (typeof password!=='string'||(password!==''&&(password.length<12||password.length>128)))))
      return res.status(400).json({error:'Enter a full name (2-100 characters), User or Admin level, and an optional password of 12-128 characters.'});
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize membership changes so concurrent requests cannot remove every admin.
      await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[req.account.organization_id]);
      const actor=(await client.query('SELECT role FROM users WHERE id=$1 AND organization_id=$2',[req.account.id,req.account.organization_id])).rows[0];
      if(actor?.role!=='admin'){await client.query('ROLLBACK');return res.status(403).json({error:'Only organization admins can make changes.'});}
      const target=(await client.query('SELECT * FROM users WHERE id=$1 AND organization_id=$2 FOR UPDATE',[req.params.id,req.account.organization_id])).rows[0];
      if(!target){await client.query('ROLLBACK');return res.status(404).json({error:'User not found in your organization.'});}
      if((req.body.username!==undefined&&req.body.username!==target.username)||(req.body.email!==undefined&&req.body.email!==target.email)){
        await client.query('ROLLBACK');return res.status(400).json({error:'Username and email cannot be changed.'});
      }
      if(target.role==='admin'&&role==='member'){
        const admins=(await client.query("SELECT id FROM users WHERE organization_id=$1 AND role='admin'",[req.account.organization_id])).rows;
        if(admins.length<=1){await client.query('ROLLBACK');return res.status(409).json({error:'Keep at least one admin in the organization.'});}
      }
      const menuRoleId=req.body.menuRoleId===undefined?target.menu_role_id:req.body.menuRoleId||null;
      if(!await validMenuRole(client,menuRoleId,req.account.organization_id)){await client.query('ROLLBACK');return res.status(400).json({error:'Choose a menu role from your organization.'});}
      const hash=password?await hashPassword(password):target.password_hash;
      const {rows}=await client.query('UPDATE users SET full_name=$3,role=$4,password_hash=$5,menu_role_id=$6 WHERE id=$1 AND organization_id=$2 RETURNING id,email,full_name,username,organization_id,role,menu_role_id',[target.id,req.account.organization_id,fullName,role,hash,menuRoleId]);
      if(password){
        await client.query('DELETE FROM sessions WHERE user_id=$1',[target.id]);
        await client.query('DELETE FROM password_resets WHERE email=$1',[target.email]);
      }
      await client.query('COMMIT');
      res.json({user:publicUser(rows[0])});
    }catch(error){await client.query('ROLLBACK');if(error.code==='23503')return res.status(409).json({error:'The selected menu role no longer exists. Reload and choose another.'});throw error;}finally{client.release();}
  });

}
