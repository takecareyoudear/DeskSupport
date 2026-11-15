import {nextRenewal} from '../../server/src/renewals.js';
export function nextDueDate(frequency,firstDue,today){
 const first=String(firstDue).slice(0,10);
 if(!today){const now=new Date();today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
 if(first>=today)return first;
 const [,month,day]=first.split('-').map(Number);
 if(frequency!=='weekly')return nextRenewal(frequency,frequency==='yearly'?month:null,day,today);
 const start=new Date(`${first}T00:00:00Z`),current=new Date(`${today}T00:00:00Z`);
 const days=Math.ceil((current-start)/86400000/7)*7;
 start.setUTCDate(start.getUTCDate()+days);
 return start.toISOString().slice(0,10);
}
