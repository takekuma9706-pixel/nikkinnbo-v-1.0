import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://zvvqhpqlucmkwwlyztzk.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2dnFocHFsdWNta3d3bHl6dHprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNTUyOTIsImV4cCI6MjA4NzczMTI5Mn0.q3y60tJtb1-ttdORhKx9knNoODMfyBY3F8PM6gJ8y5U";

export const supabase = createClient(supabaseUrl, supabaseKey);