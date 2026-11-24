import {NextResponse} from 'next/server';
import type {NextRequest} from 'next/server';
import {twinRedirect} from './lib/twin-redirect';
// One address for the whole site. The site is set up as APP_ORIGIN (for example https://jobroles.com.au). If someone
// arrives at its "www." twin (or the other way round), they are sent to the same page on the proper address.
// Without this the twin shows the site, but signing in fails there: forms are only accepted from the proper address,
// and sign-in cookies set on one address are not sent to the other.
export function proxy(request:NextRequest){
 const to=twinRedirect(request.headers.get('x-forwarded-host')||request.headers.get('host'),process.env.APP_ORIGIN,`${request.nextUrl.pathname}${request.nextUrl.search}`);
 return to?NextResponse.redirect(to,308):NextResponse.next();
}
