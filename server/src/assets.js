import { randomUUID } from 'node:crypto';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const text=(value,max)=>typeof value==='string'&&value.trim().length<=max;
const date=value=>value===null||value===''||value===undefined||(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value);
const classifications=['hardware','computer','laptop','land','building','vehicle','software','subscription','other'];
export function registerAssets(app,{pool}) {
 const base='/api/auth/workspace/assets';
 app.get(base,async(req,res)=>{
  const org=[req.account.organization_id];
  const types=(await pool.query('SELECT id,name,movement FROM asset_types WHERE organization_id=$1 ORDER BY lower(name)',org)).rows;
  const categories=(await pool.query('SELECT id,name,nature,classification FROM asset_categories WHERE organization_id=$1 ORDER BY lower(name)',org)).rows;
  const assets=(await pool.query('SELECT * FROM assets WHERE organization_id=$1 ORDER BY lower(name)',org)).rows;
  res.json({types,categories,assets});
 });
 app.post(`${base}/:kind/:action`,async(req,res)=>{
  const {kind,action}=req.params;
  const table={types:'asset_types',categories:'asset_categories',assets:'assets'}[kind];
  if(!table||!['create','update','delete'].includes(action))return res.status(404).json({error:'Unknown asset operation.'});
  const body=req.body,org=req.account.organization_id;
  if(action!=='create'&&!uuid(body.id))return res.status(400).json({error:'Choose a valid record.'});
  let columns=[],values=[];
  if(action!=='delete'){
   if(!text(body.name,100)||!body.name.trim())return res.status(400).json({error:'Enter a name of 1-100 characters.'});
   columns=['name'];values=[body.name.trim()];
   if(kind==='types'){
    if(!['movable','immovable'].includes(body.movement))return res.status(400).json({error:'Choose movable or immovable.'});
    columns.push('movement');values.push(body.movement);
   }else if(kind==='categories'){
    if(!['physical','virtual'].includes(body.nature)||!classifications.includes(body.classification))return res.status(400).json({error:'Choose a valid asset nature and classification.'});
    columns.push('nature','classification');values.push(body.nature,body.classification);
   }else{
    if(!uuid(body.type_id)||!uuid(body.category_id))return res.status(400).json({error:'Choose an asset type and category.'});
    columns.push('type_id','category_id');values.push(body.type_id,body.category_id);
    for(const key of ['start_date','end_date','renewal_date','insurance_start_date','insurance_end_date','insurance_renewal_date']){
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
