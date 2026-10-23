// RFC 5545 calendar event for an interview. Times are written in UTC, so every calendar shows the right local time.
const stamp=(d:Date)=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
const text=(s:string)=>s.replace(/\\/g,'\\\\').replace(/;/g,'\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
// Lines longer than 75 octets are folded with CRLF and a space.
const fold=(line:string)=>{const out:string[]=[];let rest=line;while(new TextEncoder().encode(rest).length>75){let n=75;while(new TextEncoder().encode(rest.slice(0,n)).length>75)n--;out.push(rest.slice(0,n));rest=' '+rest.slice(n);}out.push(rest);return out.join('\r\n');};
export function interviewIcs(i:{id:string;startsAt:string;format:string;cancelled:boolean;title:string;url:string;minutes?:number},now=new Date()){
 const start=new Date(i.startsAt),end=new Date(start.getTime()+(i.minutes??60)*60000);
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//JobRoles//Interviews//EN','METHOD:PUBLISH','BEGIN:VEVENT',`UID:${i.id}@jobroles`,`DTSTAMP:${stamp(now)}`,`DTSTART:${stamp(start)}`,`DTEND:${stamp(end)}`,`SUMMARY:${text(i.title)}`,`DESCRIPTION:${text(`${i.format}\n\nDetails: ${i.url}`)}`,`URL:${i.url}`,`STATUS:${i.cancelled?'CANCELLED':'CONFIRMED'}`,'END:VEVENT','END:VCALENDAR'].map(fold).join('\r\n')+'\r\n';
}
