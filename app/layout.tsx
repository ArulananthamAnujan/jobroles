import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'JobRoles · Find your next chapter',description:'An Australian job marketplace. Clear salaries, verified employers and private applications.',referrer:'no-referrer',robots:{index:false,follow:false},icons:{icon:'/assets/brand.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en-AU"><body>{children}</body></html>}
