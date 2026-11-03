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
2. Sign up, click **Connect Microsoft OneDrive**, approve on Microsoft's page, and you should land back on your dashboard as "Connected".
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
