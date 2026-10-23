import type {Instrumentation} from 'next';
import {reportError} from './lib/error-report';
// Server errors that escape a page or route (route handlers report their own through failure()).
export const onRequestError:Instrumentation.onRequestError=async(error,request,context)=>{
 await reportError(error,{source:`server:${context.routeType}`,path:request.path.split('?')[0]});
};
