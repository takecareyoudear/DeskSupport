import { randomUUID } from 'node:crypto';
import { hashPassword, sessionHash } from './security.js';

export const validUsername = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_.]{2,39}$/.test(value);
export const publicUser = user => ({id:user.id,email:user.email,fullName:user.full_name,username:user.username,organizationId:user.organization_id,role:user.role});
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const tables = new Set(['departments','categories','projects']);

export function registerWorkspace(app,{pool,sessionCookie,origin}) {
  const base='/api/auth/workspace';
  app.use(base,async(req,res,next)=>{
    if(req.method!=='GET' && req.get('origin')!==origin) return res.status(403).json({error:'Request origin is not allowed.'});
    const {rows}=await pool.query('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',[sessionHash(sessionCookie(req))]);
    if(!rows[0])return res.status(401).json({error:'Please log in.'});
    req.account=rows[0];
    if(req.method!=='GET' && req.account.role!=='admin')return res.status(403).json({error:'Only organization admins can make changes.'});
    next();
  });
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
    const {rows}=await pool.query('SELECT id,email,full_name,username,organization_id,role FROM users WHERE organization_id=$1 ORDER BY full_name,id',[req.account.organization_id]);
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
    try {
      const {rows}=await pool.query('INSERT INTO users(id,email,full_name,password_hash,username,organization_id,role) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,email,full_name,username,organization_id,role',[randomUUID(),email,fullName,await hashPassword(password),username,req.account.organization_id,role]);
      res.status(201).json({user:publicUser(rows[0])});
    } catch(error) {
      if(error.code==='23505')return res.status(409).json({error:'Email or username already exists.'});
      throw error;
    }
  });
}
