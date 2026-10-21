export function salaryOptions(params:URLSearchParams){
 const amount=(key:string)=>{const raw=params.get(key);if(!raw?.trim())return null;const n=Number(raw);if(!Number.isFinite(n)||n<0||n>10000000)throw Error('Enter a salary between 0 and 10,000,000.');return n;};
 const minimum=amount('salaryMin'),maximum=amount('salaryMax');if(minimum!==null&&maximum!==null&&minimum>maximum)throw Error('Maximum salary must be at least the minimum.');
 const period=params.get('salaryPeriod')||'year';if(!['hour','day','month','year'].includes(period))throw Error('Choose a valid salary period.');
 return {minimum,maximum,period};
}
export function salaryLabel(j:{salary_min:number|null;salary_max:number|null;currency:string;salary_period:string}){
 const money=(n:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:j.currency||'AUD',minimumFractionDigits:0,maximumFractionDigits:2}).format(n);
 const a=j.salary_min,b=j.salary_max;if(a===null&&b===null)return 'Salary not supplied';
 const range=a===null?`Up to ${money(b!)}`:b===null?`From ${money(a)}`:a===b?money(a):`${money(a)}–${money(b)}`;
 return `${j.currency||'AUD'} ${range} per ${j.salary_period}`;
}
