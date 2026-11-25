import {authenticatedClient,failure,response} from '@/lib/backend/server';
import {billingStatus} from '@/lib/backend/billing-status';
import {sponsoredJobs} from '@/lib/backend/features';
export const dynamic='force-dynamic';
export async function GET(){try{
 const {client}=await authenticatedClient();if(!sponsoredJobs())return response({credit:false,sponsor:false,off:true});const {data:{session}}=await client.auth.getSession();
 return response(await billingStatus(session?.access_token||''));
}catch(e){return failure(e);}}
