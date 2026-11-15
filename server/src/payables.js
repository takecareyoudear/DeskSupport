import {validPayableSchedule} from './payable-schedules.js';
import {randomUUID} from 'node:crypto';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function registerPayables(app,{pool}){
 const base='/api/auth/workspace/payables';
 app.get(base,async(req,res)=>{
  const {rows}=await pool.query('SELECT * FROM payables WHERE organization_id=$1 ORDER BY name,id',[req.account.organization_id]);
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
   if(!validPayableSchedule(body.frequency,body.due_month??null,body.due_day??null,body.due_weekday??null))return res.status(400).json({error:'Monthly requires a day (1-31), weekly a weekday, and yearly a valid month and day.'});
   if(body.remarks!==undefined&&(typeof body.remarks!=='string'||body.remarks.length>2000))return res.status(400).json({error:'Remarks allow up to 2000 characters.'});
  }
  let result;
  const values=[body.name?.trim(),body.amount,body.currency,body.frequency,body.due_month??null,body.due_day??null,body.due_weekday??null,body.remarks||''];
  if(action==='create')result=await pool.query('INSERT INTO payables(id,organization_id,name,amount,currency,frequency,due_month,due_day,due_weekday,remarks) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[randomUUID(),org,...values]);
  if(action==='update')result=await pool.query('UPDATE payables SET name=$3,amount=$4,currency=$5,frequency=$6,due_month=$7,due_day=$8,due_weekday=$9,remarks=$10,first_due_date=NULL WHERE id=$1 AND organization_id=$2 RETURNING *',[body.id,org,...values]);
  if(action==='delete')result=await pool.query('DELETE FROM payables WHERE id=$1 AND organization_id=$2 RETURNING id',[body.id,org]);
  if(!result.rowCount)return res.status(404).json({error:'Expense not found in your organization.'});
  res.status(action==='create'?201:200).json({record:result.rows[0]});
 });
}
