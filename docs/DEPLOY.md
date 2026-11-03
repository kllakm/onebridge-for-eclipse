# Deploying to Cloudflare (Workers + D1)

## 1. Microsoft app registration (Azure / Entra)
1. Go to https://entra.microsoft.com → App registrations → New registration.
2. Supported account types: "Accounts in any organizational directory and personal Microsoft accounts".
3. Redirect URI (Web): `https://<your-domain>/api/onedrive/callback`
4. Certificates & secrets → New client secret. Copy the **Value**.
5. API permissions → Microsoft Graph → Delegated: `Files.Read`, `offline_access`, `User.Read`, `openid`, `email`.

## 2. Cloudflare
```bash
npm i -g wrangler && wrangler login
wrangler d1 create eclipse-onedrive          # copy database_id into wrangler.jsonc
cp wrangler.example.jsonc wrangler.jsonc     # then edit name/database_id/APP_URL
wrangler d1 migrations apply eclipse-onedrive --remote
wrangler secret put MS_CLIENT_ID
wrangler secret put MS_CLIENT_SECRET
openssl rand -base64 32 | wrangler secret put TOKEN_ENC_KEY
npm run build && wrangler deploy
```
Optional: set `MS_TENANT` to a tenant ID to allow only one organisation (default `common`).

To deploy from GitHub, connect the repo in Cloudflare → Workers → your Worker → Settings → Builds, using build command `npm run build` and deploy command `npx wrangler deploy`.

## 3. Check it
- Open `https://<your-domain>/`. The yellow "Service not set up yet" box should be gone.
- Then follow docs/TEST-CHECKLIST.md.
