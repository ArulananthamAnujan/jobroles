import {z} from 'zod';
const id=z.string().uuid();
const text=z.string().trim().min(1).max(5000);
const application=z.object({id});
const schemas={
 'profile.save':z.object({name:z.string().trim().min(1).max(160),headline:z.string().max(240).default(''),location:z.string().max(160).default(''),skills:z.array(z.string().max(80)).max(50).default([]),searchable:z.boolean().default(false)}),
 'company.create':z.object({name:z.string().trim().min(2).max(160),about:z.string().max(5000).default(''),abn:z.string().regex(/^\d{11}$/).optional(),agency:z.boolean().default(false)}),
 'job.save':z.object({id:id.optional(),companyId:id,title:z.string().trim().min(1).max(140),description:z.string().min(40).max(30000),type:z.enum(['Full-time','Part-time','Casual','Contract','Temporary','Internship']),arrangement:z.enum(['on_site','hybrid','remote']),locations:z.array(z.string().trim().min(1).max(160)).min(1).max(20),min:z.number().min(0),max:z.number().min(0),period:z.enum(['hour','day','month','year']),sponsorship:z.boolean().default(false),submit:z.boolean().default(false),screening:z.string().max(500).optional()}).refine(x=>x.max>=x.min,'Maximum salary must be at least the minimum.'),
 'application.draft':z.object({jobId:id,resumeId:id.optional(),answers:z.record(z.string(),z.enum(['Yes','No'])).default({}),cover:z.string().max(5000).default('')}),
 'application.submit':z.object({jobId:id,resumeId:id,answers:z.record(z.string(),z.enum(['Yes','No'])),cover:z.string().max(5000).default('')}),
 'application.withdraw':application,'application.request_reinstatement':application,'application.reinstate':application,'application.view':application,
 'application.move':application.extend({stage:z.enum(['new','reviewed','shortlisted','interview','offer','hired','rejected'])}),
 'application.note':application.extend({body:text,rating:z.number().int().min(1).max(5).optional()}),
 'application.interview':z.union([application.extend({cancel:z.literal(true)}),application.extend({at:z.string().datetime({offset:true}),timeZone:z.string().min(1).max(100),format:text,cancel:z.literal(false).optional()})]),
 'message.send':application.extend({body:text}),
 'job.state':z.object({id,state:z.enum(['paused','closed','pending_review'])}),
 'member.remove':z.object({companyId:id,userId:id}),
 'job.review':z.object({id,decision:z.enum(['approve','reject']),reason:text.min(3)}),
 'company.verify':z.object({id,abnMatched:z.literal(true),evidenceType:z.enum(['domain_email','business_callback','document_review']),evidenceReference:text,reason:text.min(3)}),
 'saved.toggle':z.object({jobId:id,saved:z.boolean()}),
 'company.block':z.object({companyId:id,blocked:z.boolean()}),
};
export function parseCommand(body:unknown){
 const envelope=z.object({action:z.string(),payload:z.unknown()}).parse(body);
 if(!Object.hasOwn(schemas,envelope.action))throw new Error('Unknown command.');
 const action=envelope.action as keyof typeof schemas;
 return {action,payload:schemas[action].parse(envelope.payload)};
}
