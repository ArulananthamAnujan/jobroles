import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {makeFeedWorker} from './handler.ts';
Deno.serve(makeFeedWorker(createClient,name=>Deno.env.get(name)));
