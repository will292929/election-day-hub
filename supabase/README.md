# Supabase-backed GitHub Pages pilot

This is the preferred **free pilot** architecture. `docs/pilot.html` is a separate static entry point; the existing `docs/index.html` remains the public fictional demo until a Supabase project is connected and all access tests pass. Do not import real voter data during setup.

## One-time setup

1. Create a new Supabase project in an account you control. Do not reuse a project containing other data.
2. Apply `migrations/202609160001_pilot.sql` to that project. The migration creates campaign, membership, and voter tables, enables row-level security, revokes direct writes, and installs checked database functions for poll-watch marks, imports, exports, and audit.
3. In Supabase Auth settings, **disable public signups**. Create an admin account in the Supabase Dashboard (or invite the admin using a server-side administrative workflow). Enable MFA and enforce it before real-data consideration.
4. In the SQL editor, create the first campaign and assign the admin by replacing the placeholders below with the actual Auth user UUID and a fictional campaign name:

   ```sql
   insert into public.campaigns(name) values ('Fictional Pilot Campaign') returning id;
   insert into public.memberships(user_id,campaign_id,role,active)
   values ('AUTH_USER_UUID_HERE','CAMPAIGN_UUID_HERE','admin',true);
   ```

5. Put the project's **URL and publishable key only** into `docs/pilot-config.js`. These two values are intended for browser use. Never put a secret or legacy service-role key, database password, voter CSV, or admin password in GitHub.
6. Configure Auth redirect/site URL for the GitHub Pages origin. Publish the files, then open `/pilot.html` and verify sign-in.
7. Test with fictional records: unauthenticated users see none; volunteers see only their campaign's basic records; admin import/export works only in the assigned campaign; a different campaign's records remain inaccessible; audit events are created. Only then consider replacing the root demo page.

The browser uses the official Supabase JavaScript client from a CDN. Pin and review the exact client version before production use. There is no public signup or browser-held administrative secret. The `volunteer-invite` Edge Function creates a single-use invitation for a new volunteer, or a fresh one-time link for an existing volunteer, only after validating the signed-in administrator's active membership. Deploy it with JWT verification enabled. New links grant volunteer access only. The admin copies and shares links privately; the app does not send them by email.

## Training setup

The live fictional pilot campaign has 24 practice voters from `docs/training-voters.csv`. The visible `DEMO-` IDs, Sampletown, and Training Station names make them unmistakably fictional. Admins can download the CSV, but should not import it a second time unless intentionally updating matching demo IDs. To invite a new volunteer or issue a fresh one-time link to an existing volunteer, sign in as admin, enter their email, create the link, and send the copied URL privately. The link is a bearer credential; generate it shortly before training and do not post it publicly. Supabase's default SMTP only delivers to pre-authorized team addresses, so the pilot uses manual link sharing instead of relying on Auth email delivery. Test with actual recipients before training.

## Security boundary

The visible sign-in form is not the protection. The SQL migration protects the data with grants, row-level security, private storage for phone/address/consent, and admin-checked database functions. The public GitHub Pages code and publishable key remain viewable by everyone. The `docs/pilot.html` route itself is public, but data requests require an authenticated membership.

This is **not ready for real voter records**. Supabase Free may pause after inactivity and does not provide automatic backups. Before real use, arrange verified off-site backups and recovery, enforce MFA in database policy, review applicable data-use terms, test authorization and load, establish account revocation and incident response, and independently review the database functions. Messaging is not included.

