import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {makeMailWorker} from './handler.js';
Deno.serve(makeMailWorker(createClient,name=>Deno.env.get(name)));
