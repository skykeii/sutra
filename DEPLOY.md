# Deploying Sutra

The live demo is at <https://sutra.teentechindia.com>, served from Aditya's Mac mini (`adityatipirneni@100.87.25.47` over Tailscale, SSH key only).

## What runs on the Mac

| Launch agent | What it does |
|---|---|
| `com.sutra.app` | `node serve.mjs` from `~/sutra`, on `127.0.0.1:3100` only. Restarts if it stops |
| `com.sutra.cloudflared` | The named tunnel that serves the domain. Its token is in `~/.cloudflared/sutra-tunnel.token` and its route is set in the Cloudflare dashboard |

Other tunnels on this machine are not Sutra's. Never stop, restart or edit them.

Logs are in `~/sutra/logs`. `~/sutra/scripts/status.sh` shows the services, recent log lines and an HTTP check. The previous build is kept in `~/sutra.prev`.

## Environment variables

These live in the Mac's `~/sutra/.env.local`, mode 600. Never print or commit the file.

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | The shared Supabase project |
| `DATABASE_URL` | Only for `npm run migrate` |
| `ED25519_PRIVATE_KEY_PEM`, `ED25519_PUBLIC_KEY_PEM`, `HMAC_MATCH_KEY`, `FIELD_ENC_KEY` | Must match every other copy of the app using this database |
| `SCHOLARSHIP_PORTAL_API_KEY` | Used by `/portal-demo` |
| `APP_BASE_URL`, `DEMO_PUBLIC_URL` | `https://sutra.teentechindia.com` |
| `DEMO_MODE` | `true` shows the demo logins; `false` enforces MFA |
| `NODE_ENV` | `production` |
| `AI_PROVIDER`, `AI_MODEL`, `GEMINI_API_KEY` | Optional. See `README.md` |
| `OLLAMA_BASE_URL`, `AI_TIMEOUT_MS` | Optional |

Do not set `ALLOW_PRIVATE_WEBHOOKS` here.

## Updating

Nothing is swapped until the new build has passed on a spare port.

1. Copy the code to `~/sutra-next`, leaving out `.env*`, `node_modules` and `.next`. From this PC: `git archive HEAD | ssh adityatipirneni@100.87.25.47 'mkdir -p ~/sutra-next && tar -x -C ~/sutra-next'`.
2. On the Mac, copy `~/sutra/.env.local` into `~/sutra-next`, then run `npm ci` and `npm run build` there.
3. Start it with `HOST=127.0.0.1 PORT=3101 node serve.mjs`, and check `/`, `/login` and `/api/v1/public-key` on port 3101. Stop it.
4. Stop the app: `launchctl bootout gui/$(id -u)/com.sutra.app`.
5. Move `~/sutra` to `~/sutra.prev` and `~/sutra-next` to `~/sutra`, then copy `logs` across.
6. Start it: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.sutra.app.plist`, then check port 3100.

## Rolling back

```bash
launchctl bootout gui/$(id -u)/com.sutra.app
mv ~/sutra ~/sutra.failed && mv ~/sutra.prev ~/sutra
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.sutra.app.plist
```

## Taking the site down

```bash
launchctl bootout gui/$(id -u)/com.sutra.cloudflared
launchctl bootout gui/$(id -u)/com.sutra.app
```

To bring it back, run the same commands with `bootstrap gui/$(id -u) ~/Library/LaunchAgents/<name>.plist`.

## After a reboot

Launch agents start only once `adityatipirneni` logs in, so after a power cut the site stays down until someone does. Either fix needs an admin on the Mac:

- **Simplest:** System Settings > Users & Groups > Automatic login. FileVault must be off for this to be offered.
- **Stronger:** convert both agents to system daemons with `sudo`, in `/Library/LaunchDaemons`, with a `UserName` key.

## The Vercel copy

Pushing `main` redeploys <https://sutra-ochre.vercel.app>, which shares the same database. To match the Mac, add these in Vercel: `AI_PROVIDER`, `AI_MODEL`, `GEMINI_API_KEY`, `DEMO_PUBLIC_URL`. Vercel does not use `serve.mjs`; there, rate limits use its own `X-Forwarded-For`.

## Supabase

Add `https://sutra.teentechindia.com` as the Site URL and `https://sutra.teentechindia.com/**` to the Redirect URLs under Authentication > URL Configuration.
