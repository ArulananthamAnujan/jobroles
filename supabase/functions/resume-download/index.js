import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {makeHandler} from './handler.js';
Deno.serve(makeHandler(createClient,name=>Deno.env.get(name)));
