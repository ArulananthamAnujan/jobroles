import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import VideoRoom from '@/components/video-room';
export const metadata:Metadata={title:'Video interview · JobRoles',robots:{index:false,follow:false}};
export default async function InterviewRoom({params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))notFound();
 return <VideoRoom id={id}/>;
}
