import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {makeScanWorker} from './handler.js';
Deno.serve(makeScanWorker(createClient,name=>Deno.env.get(name)));
