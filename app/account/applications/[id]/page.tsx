import ApplicationWorkspace from '@/components/application-workspace';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <ApplicationWorkspace id={id}/>;}
