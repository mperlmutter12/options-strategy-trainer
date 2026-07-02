/* Public Supabase config for the leaderboard.
 *
 * BOTH values below are PUBLIC by design — they ship inside client-side JS
 * that anyone can read. Security is enforced server-side by Row-Level
 * Security + the submit_score() function (see supabase/schema.sql).
 *
 * NEVER put the service_role key here. That key stays only in the
 * Supabase dashboard and is used for admin actions (clearing boards). */
window.LB_CONFIG = {
  url: 'https://lwqoyhrhjqnfsgvtekis.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3cW95aHJoanFuZnNndnRla2lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMDA2NzksImV4cCI6MjA5ODU3NjY3OX0.Qn_y806gjQnsEK7303foFmXD3mI8X-9d-72g8zIx36Q'
};
