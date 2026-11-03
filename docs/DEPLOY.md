# Deploying OneDrive for Eclipse Music — step by step

You don't need a terminal for any of this. Everything happens in your browser, in this order:

1. Put the code on GitHub (from Lovable)
2. Create a Cloudflare account
3. Create the database
4. Put the database ID in the code
5. Create the Worker from GitHub → this gives you your web address
6. Set up the database tables
7. Register the app with Microsoft (uses the web address from step 5)
8. Add the secret settings to Cloudflare
9. Check everything works

Keep a notepad open. You'll collect these values along the way:

| Value | Where it comes from |
|---|---|
| Database ID | Step 3 |
| Your app address (e.g. `https://eclipse-onedrive.yourname.workers.dev`) | Step 5 |
| Redirect URI = app address + `/api/onedrive/callback` | Step 5 |
| Microsoft Application (client) ID | Step 7 |
| Microsoft client secret **Value** | Step 7 |
| Encryption key | Step 8 |

---

## Step 1 — Put the code on GitHub

1. If you don't have one, create a free account at https://github.com.
2. In Lovable, open the project, click the **GitHub** button (top right, or **Project settings → GitHub**), then **Connect to GitHub**.
3. Authorise Lovable, pick your GitHub account, and click **Create repository**.
4. Wait until Lovable says it's connected. Your code is now in a GitHub repository, and every change made in Lovable is copied there automatically.

## Step 2 — Create a Cloudflare account

1. Go to https://dash.cloudflare.com/sign-up and create a free account. Confirm your email.
2. You don't need a domain name. Cloudflare gives you a free `workers.dev` address.

## Step 3 — Create the database (D1)

1. In the Cloudflare dashboard, open the left menu: **Storage & Databases → D1 SQL Database**.
2. Click **Create Database**.
3. Name: `eclipse-onedrive` (exactly this). Location: leave as automatic, or pick Oceania. Click **Create**.
4. On the database page, copy the **Database ID** (a long code like `a1b2c3d4-...`). Save it in your notepad.

## Step 4 — Put the database ID in the code

Choose one:
- **Easiest:** paste the Database ID to me in the Lovable chat and I'll put it in for you, **or**
- In GitHub, open your repository → file `wrangler.jsonc` → pencil icon (Edit). Replace `PASTE_YOUR_DATABASE_ID_HERE` with your ID (keep the quotes), then click **Commit changes**.

Do this **before** step 5. Otherwise the first deployment will fail.

## Step 5 — Create the Worker from GitHub (this gives you your web address)

1. In Cloudflare: left menu **Compute (Workers) → Workers & Pages** → **Create** → **Import a repository** (under "Workers").
2. Click **Connect GitHub**, allow Cloudflare access to your repository, and select it.
3. Fill in the settings:
   - **Project name:** `eclipse-onedrive` (must match the name in `wrangler.jsonc`)
   - **Build command:** `bun run build`
   - **Deploy command:** `npx wrangler deploy`
   - **Root directory:** leave as `/`
4. Click **Create and deploy**. The first build takes a few minutes. Wait for a green "Success".
5. When it's done, Cloudflare shows the address, e.g. `https://eclipse-onedrive.yourname.workers.dev`. You can also find it under the Worker → **Settings → Domains & Routes**.
6. Write down:
   - **App address:** `https://eclipse-onedrive.<yours>.workers.dev`
   - **Redirect URI:** `https://eclipse-onedrive.<yours>.workers.dev/api/onedrive/callback`

If you open the app address now, you should see the home page with a yellow "Service not set up yet" box. That's expected.

From now on, each change in Lovable goes to GitHub, and Cloudflare rebuilds and redeploys it automatically.

## Step 6 — Set up the database tables

1. Cloudflare → **Storage & Databases → D1 SQL Database → eclipse-onedrive → Console** tab.
2. In GitHub, open `migrations/0001_init.sql`. Click **Raw**, then select all and copy it.
3. Paste it into the D1 console and click **Execute**.
4. Open the **Tables** tab. You should see: `users`, `sessions`, `oauth_states`, `microsoft_connections`, `music_files`, `sync_state`, `addon_tokens`, `audit_logs`.

Only run this once. Running it again gives "table already exists" errors, which are harmless.

For a new installation using the current code, also apply 0002 and 0003, then complete the compact-storage procedure below and the 0005 progress-counter update before opening the dashboard. Never run already-applied migrations again just because the dashboard fails.

## Step 7 — Register the app with Microsoft

1. Go to https://entra.microsoft.com and sign in with your Microsoft account. A personal Outlook/Hotmail account works.
   - If Entra asks you to create a tenant or directory, use https://portal.azure.com → search **App registrations** instead. It's the same screen.
2. **Applications → App registrations → New registration**.
   - **Name:** `OneDrive for Eclipse Music`
   - **Supported account types:** *"Accounts in any organizational directory and personal Microsoft accounts"*. This is important: without it, personal OneDrive accounts can't connect.
   - **Redirect URI:** platform **Web**, value = your **Redirect URI** from step 5 (e.g. `https://eclipse-onedrive.yourname.workers.dev/api/onedrive/callback`). It must match exactly, with `https` and no trailing slash.
   - Click **Register**.
3. On the overview page, copy the **Application (client) ID** to your notepad.
4. **Certificates & secrets → Client secrets → New client secret**. Description: `cloudflare`. Expires: 24 months. Click **Add**.
   - Copy the **Value** column right away. It's only shown once. Don't copy the "Secret ID".
   - Put a reminder in your calendar to replace it before it expires.
5. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**. Tick: `Files.Read`, `offline_access`, `User.Read`, `openid`, `email`. Click **Add permissions**.
   - You don't need "Grant admin consent". Each user agrees when they connect.

## Step 8 — Add the secret settings to Cloudflare

First, make the encryption key:
1. In any browser tab, press **F12** (or right-click → Inspect) → **Console** tab.
2. Paste this and press Enter:
   ```js
   btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
   ```
3. Copy the result (about 44 characters, ending in `=`). That's your encryption key. Keep it safe. If it's lost or changed, every user has to reconnect OneDrive.

Then in Cloudflare: **Workers & Pages → eclipse-onedrive → Settings → Variables and Secrets → Add**. Add each of these with **Type: Secret**:

| Variable name | Value |
|---|---|
| `MS_CLIENT_ID` | Application (client) ID from step 7 |
| `MS_CLIENT_SECRET` | Client secret **Value** from step 7 |
| `TOKEN_ENC_KEY` | Encryption key from above |
| `APP_URL` | Your app address from step 5, e.g. `https://eclipse-onedrive.yourname.workers.dev` (no trailing slash) |

Click **Deploy** (or Save) after adding them. Use **Secret** for all four, including `APP_URL`, because plain-text variables added in the dashboard can be wiped by the next automatic deploy.

## Step 9 — Check everything works

1. Open your app address. The yellow "Service not set up yet" box should be **gone**.
2. Sign in with your existing testing account (new signups are closed), click **Connect Microsoft OneDrive**, approve on Microsoft's page, and you should land back on your dashboard as "Connected".
3. Put a few songs in a folder called `Music` in your OneDrive, click **Scan library**, then **Create addon link**.
4. Now work through `docs/TEST-CHECKLIST.md` on Eclipse Android and Eclipse Web, and send me the results.

## If something goes wrong

| Problem | Fix |
|---|---|
| Cloudflare build fails mentioning D1 / database_id | Step 4 wasn't done, or the ID has a typo. |
| Build fails "name does not match" | Worker project name must be `eclipse-onedrive`, the same as in `wrangler.jsonc`. |
| Yellow box still shows after step 8 | Make sure you clicked Deploy after adding secrets. Check the names are spelled exactly as shown. |
| Microsoft error **AADSTS50011** (redirect URI mismatch) | The redirect URI in step 7 doesn't exactly match `APP_URL` + `/api/onedrive/callback`. |
| Microsoft says the app isn't available for personal accounts | Step 7, account types: choose the option that includes personal Microsoft accounts. Change it under **Authentication** (or the **Manifest**). |
| "Microsoft sign-in failed" after approving | Usually a wrong or expired client secret. Check you copied the **Value**, not the Secret ID. |
| Scan finds 0 tracks | Check the folder name on the dashboard matches your OneDrive folder exactly, e.g. `Music`. |
| Something else | Cloudflare → your Worker → **Logs** (turn on "Workers Logs") and send me the error text. Never send secrets. |

## Using your own domain later (optional)

Worker → **Settings → Domains & Routes → Add → Custom domain**. Then update `APP_URL` in Cloudflare and add the new redirect URI in Microsoft (step 7, **Authentication → Add URI**).

## Faster tag reading and small storage update (existing installation)

**Superseded for compact shared storage:** use the next section when applying `0004_compact_library.sql`. Do not resume scanning between 0003 and 0004 with the latest code.

1. Wait for Cloudflare's latest automatic deployment to show **Success**, then refresh your app. Images now come from `/images/` on your own Worker; no Lovable image address is required.
2. Click **Check one failed file** to test the improved MP3 reader. If that succeeds, click **Retry failed files** to requeue the earlier failures and continue unchecked tracks. Completed tags are retained; no full rescan or replacement addon link is needed. Unsupported tag layouts can still reach the safety limits.
3. For the small storage changes, first create a recovery point/export using your D1 database's available **Time Travel** or **Export** controls, and record the current reported database size. Pause scanning/tag reading while applying the change.
4. Open **D1 → eclipse-onedrive → Console**. In GitHub, open `migrations/0003_small_storage.sql` → **Raw**, and execute each SQL statement separately in file order. This assumes `0002_metadata.sql` was already applied. This clears unused folder-path/MIME copies and replaces the metadata queue index; it does not delete songs or their tags.
5. Refresh your app, check the track/album counts, search for a tagged song in Eclipse and play it. Resume **Read song details** or **Retry failed files** as appropriate.
6. Compare D1's reported size after the change. SQLite can reuse freed pages without immediately reporting a smaller file; a large or immediate reduction is not guaranteed. Do not delete songs or run a database rebuild just to force a smaller number.

No Microsoft permissions, secrets, existing account, addon link or database table layout changes are required. New signups remain closed during testing; use your existing account.

## Compact shared artist/album storage — reset and rescan

This is the current required upgrade for the latest app code. It stores artist and album names once per user and uses small numeric references on songs. It resets **all indexed music and saved scan progress in this testing database**, not accounts, passwords, Microsoft connections, addon links or any OneDrive files. Eclipse search/playback will be unavailable while the index is empty or rebuilding.

1. Stop any scan/tag pass by refreshing the app, then close the app tab and stop Eclipse playback. Keep them closed while changing the database.
2. Open **Cloudflare → D1 → eclipse-onedrive**. Record the current database size and save an export or available Time Travel recovery point before proceeding. Do not delete the database: it contains your existing account and encrypted connection.
3. Wait for the latest Worker deployment to show **Success**. The latest scan/tag code requires the compact schema, so do not run it against the old tables.
4. Open **D1 → Console**. Migrations `0001_init.sql` and `0002_metadata.sql` must already be applied. If `0003_small_storage.sql` has not been applied, execute its statements in order first. Do not run 0001/0002 again.
5. In GitHub open **migrations/0004_compact_library.sql → Raw**. Execute each complete SQL statement in order. For every `CREATE TRIGGER`, paste the **entire block from CREATE TRIGGER through END; as one submission**—the semicolons inside are part of that block. Do not paste individual trigger-body lines. The first two statements clear the old music index and scan cursor intentionally.
6. Verify the tables **music_tracks**, **library_artists**, **library_albums** exist. `music_files` is now a view, not a stored table. Run:
   ```sql
   SELECT name, type FROM sqlite_master WHERE name IN ('music_tracks','library_artists','library_albums','music_files','music_files_insert','music_files_update','music_files_delete');
   ```
   Expected: three tables, one view, three triggers. If a statement fails, stop and send the error; do not restart the migration from its destructive first line or continue scanning with a partial setup.
7. Apply the **0005 progress-counter update** below before reopening your app. Then sign in with your existing account. It should show zero tracks and remain connected to OneDrive. Click **Scan library**, then **Read song details**. Keep the page open. You do not need a new addon link or Microsoft credentials.
8. In Eclipse, search a tagged song, open its album and artist, and play it. Saved tracks keep the same OneDrive IDs, but cannot resolve until indexed again. Report any search/album/artist/playback issue before sharing access.
9. After tag reading completes, record D1's size again. Shared-name cleanup runs when scan/tag passes finish. SQLite may retain freed pages for reuse; a lower reported physical file size is not guaranteed. Do not recreate the whole database or run unsupported compaction commands.

The migration has not been applied to your Cloudflare database from this chat. A synthetic local comparison showed a smaller layout; actual savings depend on your library and remain to be measured. Existing partial-update and reset tests verify isolation and stable Eclipse track responses, not the deployed Eclipse session.

## Database recovery — dashboard returns 500 or upgrade incomplete

Do not delete the database or rerun 0004 from its first line. A resource 500 alone does not establish the cause: an incomplete upgrade, exhausted daily quota or another server error can cause failures.

1. Close all scan/tag tabs and stop Eclipse requests. Save a D1 export or recovery point if available. Keep your secrets unchanged.
2. Open **D1 → your database → Console** and run this read-only inspection:
   ```sql
   SELECT name,type FROM sqlite_master
   WHERE name IN ('users','sessions','microsoft_connections','sync_state','addon_tokens',
     'music_files','music_tracks','library_artists','library_albums',
     'music_files_insert','music_files_update','music_files_delete',
     'library_progress','library_progress_insert','library_progress_update','library_progress_delete')
   ORDER BY name;
   ```
3. Send the result and, if available, the failed request's **Network → Response** text. Never send cookies, credentials, or the private addon URL. The generic browser line "Failed to load resource" is not the underlying error.
4. If `music_files` is a **table** and none of the compact tables exist, the compact upgrade has not completed. Follow its backup/prerequisite instructions first; do not rescan with the latest code yet.
5. If compact objects are mixed or missing, stop and get a repair based on this inventory. Do not guess missing statements, rerun destructive steps, or restore an old backup without confirming which account/connection changes it would undo.
6. If all three compact tables, the `music_files` view and its three triggers exist, **do not run 0004 again**. If the progress table/triggers are absent, use the non-destructive 0005 procedure next.
7. If all objects exist, check the failed response and **Worker → Logs** for the actual error and confirm the `DB` binding points to this database. If the daily allowance is exhausted, wait for it to reset; schema changes will not fix a quota error.

## 0005 progress-counter update — non-destructive

This removes whole-library recounts from each three-song tag batch and each scan step. It keeps a single small row of counts per owner, maintained atomically when songs are inserted, deleted or change tag status. It adds a counter write for each relevant track change; unchanged status does not trigger a counter update. Actual D1 reads/writes and savings require measurement after deployment.

1. Complete and verify 0004 first. Do not apply 0005 to a partial compact schema.
2. Stop scanning, tag reading and Eclipse requests. Back up or record a recovery point.
3. Open **migrations/0005_library_progress.sql → Raw** in GitHub. In D1 Console execute each complete statement in order; paste each entire `CREATE TRIGGER ... END;` block as one submission. The backfill reads existing tracks once and preserves all songs, accounts, connections and addon links. Stop if any statement fails.
4. Verify `library_progress` is a table and `library_progress_insert`, `library_progress_update`, `library_progress_delete` are triggers using the recovery inspection above. All four are required.
5. Wait for the current Worker deployment to show Success, refresh and sign in. Try **Read song details**, refresh to interrupt, then resume. Checked/tagged/unavailable counts should remain correct. Test a song in Eclipse as well.
6. Compare D1 Row Metrics over a known short tag pass before/after with equivalent successful work, separately recording rows read and rows written. Do not treat smaller database storage as proof of reduced daily quota use.
