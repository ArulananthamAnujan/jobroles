import {parseCommand} from '@/lib/backend/commands';
import {authenticatedClient,response,failure,sameOrigin,jsonBody,ApiError} from '@/lib/backend/server';
export async function POST(request:Request){try{
 sameOrigin(request);const {client}=await authenticatedClient();
 let command;try{command=parseCommand(await jsonBody(request));}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(400,'Invalid command fields. Please check your form.');}
 const {data,error}=await client.rpc('jp_command',command);
 if(error)throw new ApiError(error.code==='42501'?403:400,['42501','22023'].includes(error.code)?error.message:'The change could not be saved. Check the fields and try again.');
 return response({result:data});
}catch(error){return failure(error);}}
