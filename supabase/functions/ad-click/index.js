import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {makeAdClickHandler} from './handler.js';
Deno.serve(makeAdClickHandler(createClient,name=>Deno.env.get(name)));
