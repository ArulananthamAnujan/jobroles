import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {makeAlertWorker} from './handler.ts';
Deno.serve(makeAlertWorker(createClient,name=>Deno.env.get(name)));
