import {authenticatedClient,failure,response} from '@/lib/backend/server';
import {billingStatus} from '@/lib/backend/billing-status';
export const dynamic='force-dynamic';
export async function GET(){try{
 const {client}=await authenticatedClient();const {data:{session}}=await client.auth.getSession();
 return response(await billingStatus(session?.access_token||''));
}catch(e){return failure(e);}}
