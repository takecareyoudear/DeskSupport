import {validRenewal,nextRenewal} from './renewals.js';
export function validPayableSchedule(frequency,month,day,weekday){
 if(frequency==='weekly')return month===null&&day===null&&Number.isInteger(weekday)&&weekday>=0&&weekday<=6;
 return weekday===null&&validRenewal(frequency,month,day);
}
export function nextDueDate(schedule,today){
 const {frequency,due_month:month,due_day:day,due_weekday:weekday}=schedule;
 if(!validPayableSchedule(frequency,month,day,weekday))return null;
 if(!today){const now=new Date();today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
 if(frequency!=='weekly')return nextRenewal(frequency,month,day,today);
 const current=new Date(`${today}T00:00:00Z`);
 current.setUTCDate(current.getUTCDate()+(weekday-current.getUTCDay()+7)%7);
 return current.toISOString().slice(0,10);
}
