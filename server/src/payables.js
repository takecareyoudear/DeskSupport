import {randomUUID} from 'node:crypto';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function registerPayables(app,{pool}){
 const base='/api/auth/workspace/payables';
 app.get(base,async(req,res)=>{
  const {rows}=await pool.query('SELECT * FROM payables WHERE organization_id=$1 ORDER BY first_due_date,name,id',[req.account.organization_id]);
  res.json({payables:rows});
 });
 app.post(`${base}/:action`,async(req,res)=>{
  const {action}=req.params,body=req.body,org=req.account.organization_id;
  if(!['create','update','delete'].includes(action))return res.status(404).json({error:'Unknown expense operation.'});
  if(action!=='create'&&!uuid(body.id))return res.status(400).json({error:'Choose a valid expense.'});
  if(action!=='delete'){
   if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>100)return res.status(400).json({error:'Enter an expense name of 1-100 characters.'});
   if(typeof body.amount!=='string'||!/^\d{1,9}(\.\d{1,2})?$/.test(body.amount)||Number(body.amount)<=0)return res.status(400).json({error:'Enter a positive amount with at most two decimal places.'});
   if(!['INR','USD','EUR','GBP','AED','CAD','AUD','SGD'].includes(body.currency)||!['weekly','monthly','yearly'].includes(body.frequency))return res.status(400).json({error:'Choose a currency and weekly, monthly, or yearly frequency.'});
   if(typeof body.first_due_date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(body.first_due_date)||isNaN(Date.parse(body.first_due_date))||new Date(body.first_due_date).toISOString().slice(0,10)!==body.first_due_date)return res.status(400).json({error:'Enter a valid first due date.'});
   if(body.remarks!==undefined&&(typeof body.remarks!=='string'||body.remarks.length>2000))return res.status(400).json({error:'Remarks allow up to 2000 characters.'});
  }
  let result;
  const values=[body.name?.trim(),body.amount,body.currency,body.frequency,body.first_due_date,body.remarks||''];
  if(action==='create')result=await pool.query('INSERT INTO payables(id,organization_id,name,amount,currency,frequency,first_due_date,remarks) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[randomUUID(),org,...values]);
  if(action==='update')result=await pool.query('UPDATE payables SET name=$3,amount=$4,currency=$5,frequency=$6,first_due_date=$7,remarks=$8 WHERE id=$1 AND organization_id=$2 RETURNING *',[body.id,org,...values]);
  if(action==='delete')result=await pool.query('DELETE FROM payables WHERE id=$1 AND organization_id=$2 RETURNING id',[body.id,org]);
  if(!result.rowCount)return res.status(404).json({error:'Expense not found in your organization.'});
  res.status(action==='create'?201:200).json({record:result.rows[0]});
 });
}
