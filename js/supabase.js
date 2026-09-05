// Der gemeinsame Supabase-Client. Version bewusst festgenagelt,
// damit ein Update der Bibliothek die App nicht unbemerkt veraendert.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./konfig.js";

export const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
