import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {makeBillingHandler} from './handler.js';
Deno.serve(makeBillingHandler(createClient,name=>Deno.env.get(name)));
