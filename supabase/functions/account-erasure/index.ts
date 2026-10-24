import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {makeErasureHandler} from './handler.js';
Deno.serve(makeErasureHandler(createClient,name=>Deno.env.get(name)));
