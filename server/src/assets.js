import {canAccess} from './menu-catalog.js';
import { validRenewal } from './renewals.js';
import { randomUUID } from 'node:crypto';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const text=(value,max)=>typeof value==='string'&&value.trim().length<=max;
const date=value=>value===null||value===''||value===undefined||(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value);
const assetTypes=['movable','immovable','virtual'];
export function registerAssets(app,{pool}) {
 const base='/api/auth/workspace/assets';
 app.get(base,async(req,res)=>{
  const org=[req.account.organization_id];

  const categories=(await pool.query('SELECT id,name,asset_type,classification FROM asset_categories WHERE organization_id=$1 ORDER BY lower(name)',org)).rows;
  const assets=canAccess({...req.account,menus:req.account.access_menus},'assets.register')?(await pool.query('SELECT * FROM assets WHERE organization_id=$1 ORDER BY lower(name)',org)).rows:[];
  res.json({categories,assets});
 });
 app.post(`${base}/:kind/:action`,async(req,res)=>{
  const {kind,action}=req.params;
  const table={categories:'asset_categories',assets:'assets'}[kind];
  if(!table||!['create','update','delete'].includes(action))return res.status(404).json({error:'Unknown asset operation.'});
  const body=req.body,org=req.account.organization_id;
  if(action!=='create'&&!uuid(body.id))return res.status(400).json({error:'Choose a valid record.'});
  if(action==='update'){
   const target=await pool.query(`SELECT id FROM ${table} WHERE id=$1 AND organization_id=$2`,[body.id,org]);
   if(!target.rows.length)return res.status(404).json({error:'Record not found in your organization.'});
  }
  let columns=[],values=[];
  if(action!=='delete'){
   if(!text(body.name,100)||!body.name.trim())return res.status(400).json({error:'Enter a name of 1-100 characters.'});
   columns=['name'];values=[body.name.trim()];
   if(!assetTypes.includes(body.asset_type))return res.status(400).json({error:'Choose Movable, Immovable, or Virtual.'});
   columns.push('asset_type');values.push(body.asset_type);
   if(kind==='categories'){
    if(typeof body.is_subscription!=='boolean')return res.status(400).json({error:'Choose whether this category is a subscription.'});
    columns.push('nature','classification');values.push(body.asset_type==='virtual'?'virtual':'physical',body.is_subscription?'subscription':'other');
    if(action==='update'){
     const used=await pool.query('SELECT id FROM assets WHERE category_id=$1 AND organization_id=$2 LIMIT 1',[body.id,org]);
     const old=(await pool.query('SELECT asset_type,classification FROM asset_categories WHERE id=$1 AND organization_id=$2',[body.id,org])).rows[0];
     if(used.rows.length&&old&&(old.asset_type!==body.asset_type||(old.classification==='subscription')!==body.is_subscription))return res.status(409).json({error:'This category is in use. Its type and subscription setting cannot be changed.'});
    }
   }else{
    if(!uuid(body.category_id))return res.status(400).json({error:'Choose a category.'});
    const category=(await pool.query('SELECT asset_type,classification FROM asset_categories WHERE id=$1 AND organization_id=$2',[body.category_id,org])).rows[0];
    if(!category||category.asset_type!==body.asset_type)return res.status(400).json({error:'Choose a category belonging to the selected asset type.'});
    if(category.classification==='subscription'&&(!body.end_date||!body.renewal_frequency))return res.status(400).json({error:'Subscription assets require an expiry date and renewal schedule.'});
    columns.push('category_id');values.push(body.category_id);
    for(const prefix of ['renewal','insurance_renewal']){
     const frequency=body[`${prefix}_frequency`]||null;
     const month=body[`${prefix}_month`]??null,day=body[`${prefix}_day`]??null;
     if(frequency?!validRenewal(frequency,month,day):(month!==null||day!==null))return res.status(400).json({error:'Choose monthly with a day (1-31), or yearly with a valid month and day.'});
     columns.push(`${prefix}_frequency`,`${prefix}_month`,`${prefix}_day`,`${prefix}_date`);values.push(frequency,month,day,null);
    }
    for(const key of ['start_date','end_date','insurance_start_date','insurance_end_date']){
     if(!date(body[key]))return res.status(400).json({error:'Enter valid calendar dates.'});
     columns.push(key);values.push(body[key]||null);
    }
    if((body.start_date&&body.end_date&&body.end_date<body.start_date)||(body.insurance_start_date&&body.insurance_end_date&&body.insurance_end_date<body.insurance_start_date))return res.status(400).json({error:'End dates must be on or after their start dates.'});
    for(const key of ['insurer','policy_number','notes']){
     const value=body[key]??'';
     if(!text(value,key==='notes'?2000:100))return res.status(400).json({error:'Insurance fields allow 100 characters; notes allow 2000.'});
     columns.push(key);values.push(value.trim());
    }
   }
  }
  try{
   let result;
   if(action==='create')result=await pool.query(`INSERT INTO ${table}(id,organization_id,${columns.join(',')}) VALUES($1,$2,${values.map((_,i)=>'$'+(i+3)).join(',')}) RETURNING *`,[randomUUID(),org,...values]);
   if(action==='update')result=await pool.query(`UPDATE ${table} SET ${columns.map((c,i)=>c+'=$'+(i+3)).join(',')} WHERE id=$1 AND organization_id=$2 RETURNING *`,[body.id,org,...values]);
   if(action==='delete')result=await pool.query(`DELETE FROM ${table} WHERE id=$1 AND organization_id=$2 RETURNING id`,[body.id,org]);
   if(!result.rowCount)return res.status(404).json({error:'Record not found in your organization.'});
   res.status(action==='create'?201:200).json({record:result.rows[0]});
  }catch(error){
   if(error.code==='23505')return res.status(409).json({error:'A record with this name already exists.'});
   if(error.code==='23503'||error.code==='23001')return res.status(409).json({error:action==='delete'?'This master is used by an asset. Update or delete the asset first.':'Choose type and category records from your organization.'});
   throw error;
  }
 });
}
