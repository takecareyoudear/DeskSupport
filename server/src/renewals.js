// Calendar-only recurrence; short months use their last day. Today is inclusive.
export function validRenewal(frequency,month,day){
 if(!['monthly','yearly'].includes(frequency)||!Number.isInteger(day)||day<1||day>31)return false;
 if(frequency==='monthly')return month===null;
 return Number.isInteger(month)&&month>=1&&month<=12&&day<=new Date(Date.UTC(2000,month,0)).getUTCDate();
}
export function nextRenewal(frequency,month,day,today){
 if(!validRenewal(frequency,month,day))return null;
 if(!today){const now=new Date();today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
 const [year,currentMonth]=today.split('-').map(Number);
 const occurrence=(y,m)=>`${y}-${String(m).padStart(2,'0')}-${String(Math.min(day,new Date(Date.UTC(y,m,0)).getUTCDate())).padStart(2,'0')}`;
 if(frequency==='yearly'){const candidate=occurrence(year,month);return candidate>=today?candidate:occurrence(year+1,month);}
 const candidate=occurrence(year,currentMonth);
 return candidate>=today?candidate:occurrence(currentMonth===12?year+1:year,currentMonth===12?1:currentMonth+1);
}
