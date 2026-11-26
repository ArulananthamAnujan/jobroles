import {Brand} from './market-ui';
// Shown while a portal finds out whether the visitor is signed in. It is deliberately plain: no dashboard menu, so
// someone who turns out to be signed out never sees a dashboard appear and then vanish.
export default function PortalLoading({what}:{what:string}){
 return <><header className="topbar"><Brand/></header><main className="main account-shell portal-loading" aria-busy="true"><span className="portal-spin" aria-hidden="true"/><p role="status">{what}</p></main></>;
}
