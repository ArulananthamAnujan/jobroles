import {z} from 'zod';
import {authenticatedClient,failure,response,sameOrigin,jsonBody,ApiError} from '@/lib/backend/server';
export const dynamic='force-dynamic';
const id=z.string().uuid(),reason=z.string().trim().min(3).max(500);
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('bulk'),kind:z.enum(['review','interview','question','answer']),ids:z.array(id).min(1).max(200),decision:z.enum(['publish','reject']),reason}),
 z.object({action:z.literal('autopublish'),enabled:z.boolean()}),
 z.object({action:z.literal('resolve'),kind:z.enum(['review','interview','question','answer']),id,remove:z.boolean(),reason}),
 z.object({action:z.literal('refund'),companyId:id,amount:z.number().int().min(1).max(1000000),reason}),
 z.object({action:z.literal('ticket'),id,status:z.enum(['open','answered','closed']),note:z.string().max(2000).default('')}),
]);
const fail=(e:{code?:string}|null)=>new ApiError(e?.code==='42501'?403:400,e?.code==='42501'?'Administrator required.':'That could not be done.');
// Operations tools for administrators: reported posts, click quality, support tickets and moderation settings.
export async function GET(request:Request){try{
 const {client}=await authenticatedClient();const r=new URL(request.url).searchParams.get('resource');
 const rpc=r==='reports'?'jp_content_reports':r==='clicks'?'jp_click_quality':r==='support'?'jp_support_queue':r==='settings'?'jp_moderation_settings':null;
 if(!rpc)throw new ApiError(400,'Unknown resource.');
 const {data,error}=await client.rpc(rpc);if(error)throw fail(error);return response({data});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 sameOrigin(request);const {client}=await authenticatedClient();
 const parsed=schema.safeParse(await jsonBody(request));if(!parsed.success)throw new ApiError(400,'Check the details and try again.');
 const d=parsed.data;
 const {data,error}=d.action==='bulk'?await client.rpc('jp_bulk_moderate',{kind:d.kind,targets:d.ids,decision:d.decision,reason:d.reason})
  :d.action==='autopublish'?await client.rpc('jp_set_auto_publish',{enabled:d.enabled})
  :d.action==='resolve'?await client.rpc('jp_resolve_report',{kind:d.kind,target:d.id,remove:d.remove,reason:d.reason})
  :d.action==='refund'?await client.rpc('jp_refund_credit',{company:d.companyId,amount:d.amount,reason:d.reason})
  :await client.rpc('jp_update_ticket',{target:d.id,next_status:d.status,note:d.note});
 if(error)throw fail(error);return response({result:data});
}catch(e){return failure(e);}}
