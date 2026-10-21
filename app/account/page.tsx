import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const params=await searchParams;const q=new URLSearchParams();for(const [k,v] of Object.entries(params)){if(typeof v==='string')q.set(k,v);}redirect(`${params.view==='hiring'?'/employer':'/job-seeker'}${q.size?'?'+q:''}`);}
