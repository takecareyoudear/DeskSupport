import {randomUUID} from 'node:crypto';
import {MENU_TREE,ALL_MENU_IDS,ROLE_MENU_IDS} from './menu-catalog.js';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export async function menuAccess(pool,user){
 if(user.role==='admin')return {...user,access_menus:ALL_MENU_IDS};
 const {rows}=await pool.query('SELECT menus FROM menu_roles WHERE id=$1 AND organization_id=$2',[user.menu_role_id||null,user.organization_id]);
 return {...user,access_menus:(rows[0]?.menus||[]).filter(id=>ROLE_MENU_IDS.includes(id))};
}
export async function validMenuRole(pool,id,org){
 if(id===null||id===undefined||id==='')return true;
 if(!uuid(id))return false;
 return (await pool.query('SELECT id FROM menu_roles WHERE id=$1 AND organization_id=$2',[id,org])).rows.length===1;
}
export function registerRoles(app,{pool}){
 const base='/api/auth/workspace/roles';
 app.get(base,async(req,res)=>{
  if(req.account.role!=='admin')return res.status(403).json({error:'Only admins can manage roles.'});
  const {rows}=await pool.query('SELECT id,name,menus FROM menu_roles WHERE organization_id=$1 ORDER BY lower(name),id',[req.account.organization_id]);
  res.json({roles:rows,menuTree:MENU_TREE});
 });
 app.post(`${base}/:action`,async(req,res)=>{
  if(req.account.role!=='admin')return res.status(403).json({error:'Only admins can manage roles.'});
  const {action}=req.params,{id,name,menus}=req.body,org=req.account.organization_id;
  if(!['create','update','delete'].includes(action))return res.status(404).json({error:'Unknown role operation.'});
  if(action!=='create'&&!uuid(id))return res.status(400).json({error:'Choose a valid role.'});
  if(action!=='delete'&&(typeof name!=='string'||!name.trim()||name.trim().length>100||!Array.isArray(menus)||menus.length>ROLE_MENU_IDS.length||menus.some(menu=>!ROLE_MENU_IDS.includes(menu))))return res.status(400).json({error:'Enter a role name of 1-100 characters and select valid menus. User and role administration require Admin access.'});
  try{
   let result;
   if(action==='create')result=await pool.query('INSERT INTO menu_roles(id,organization_id,name,menus) VALUES($1,$2,$3,$4) RETURNING id,name,menus',[randomUUID(),org,name.trim(),[...new Set(menus)]]);
   if(action==='update')result=await pool.query('UPDATE menu_roles SET name=$3,menus=$4 WHERE id=$1 AND organization_id=$2 RETURNING id,name,menus',[id,org,name.trim(),[...new Set(menus)]]);
   if(action==='delete')result=await pool.query('DELETE FROM menu_roles WHERE id=$1 AND organization_id=$2 RETURNING id',[id,org]);
   if(!result.rowCount)return res.status(404).json({error:'Role not found in your organization.'});
   res.status(action==='create'?201:200).json({record:result.rows[0]});
  }catch(error){
   if(error.code==='23505')return res.status(409).json({error:'A role with this name already exists.'});
   if(error.code==='23503'||error.code==='23001')return res.status(409).json({error:'This role is assigned to users. Reassign or remove it from those users before deleting.'});
   throw error;
  }
 });
}
