import {z} from 'zod';
const list=z.array(z.string().trim().min(1).max(160)).min(1).max(20);
export const preferenceInput=z.discriminatedUnion('mode',[
 z.object({mode:z.literal('manual')}),
 z.object({mode:z.literal('automatic'),resumeId:z.string().uuid(),acknowledged:z.literal(true),criteria:z.object({
  titles:list,locations:list,employmentTypes:list,arrangements:list,
  minimumSalary:z.number().min(0).max(10000000),salaryPeriod:z.enum(['hour','day','month','year']),
  workRights:z.enum(['unrestricted','restricted','sponsorship_required']),availability:z.string().trim().min(1).max(240),
  experience:z.string().trim().min(1).max(2000),excludedCompanies:z.array(z.string().trim().min(1).max(160)).max(50),
  dailyLimit:z.number().int().min(1).max(20)
 })})
]);
