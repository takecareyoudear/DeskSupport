# DeskSupport

Responsive React login and email-first registration, Node.js/Express API, PostgreSQL storage, and SMTP email delivery.

Registration: email → emailed six-digit OTP → full name and password → sign in. OTPs expire after ten minutes, allow five guesses, and have a sixty-second resend cooldown. Email verification grants a single-use fifteen-minute registration token. Passwords use salted scrypt hashes; sessions use opaque HttpOnly cookies.

## Local setup

1. Install Node.js 22 LTS or newer and PostgreSQL (or use your hosted PostgreSQL database).
2. From this directory run `npm install`.
3. Copy `server/.env.example` to `server/.env` and populate database, SMTP, origin, and two distinct random secrets. Never commit this file. For a local database only, set `DATABASE_SSL=false`.
4. Copy `client/.env.example` to `client/.env`.
5. Run `npm run server` and, in another terminal, `npm run dev`.
6. Open http://localhost:5173.

The API creates the initial tables on startup. The database user must have table creation permissions. There are no fake OTPs or development bypasses: SMTP must be configured to register.

## Checks

`npm run build` builds the frontend. `npm test --workspace server` verifies password and OTP hashing. End-to-end verification requires running PostgreSQL and SMTP: send a code, test a wrong code, verify the correct code, register, then log in with correct and incorrect passwords. Check expiry, five-attempt lockout, resend cooldown, single-use registration, duplicate registration, and layout at 375px and desktop widths.

## Deployment

- Vercel: keep Root Directory at the repository root (blank). The committed `vercel.json` builds `client/dist` and routes `/api/*` to `api/index.mjs`, which exports the Express application. The deployed frontend calls its own origin; no `VITE_API_URL` is needed on Vercel.
- Add `DATABASE_URL`, `DATABASE_SSL=true`, `TOKEN_SECRET`, `OTP_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM` privately in Vercel environment settings. Set `CLIENT_ORIGIN` to the exact website origin and `TRUST_PROXY_HOPS=1`. Redeploy after changing environment variables. Never upload `.env` to Git.
- For the temporary self-signed database setup, set `DATABASE_SSL_REJECT_UNAUTHORIZED=false`. TLS remains enabled but server identity is not checked. Before production use, restore `true` and configure the provider's CA via `DATABASE_CA_FILE` if necessary. Certificate verification defaults to enabled.
- Backend: requires a host that explicitly supports persistent Node.js applications, outbound SMTP, and PostgreSQL connections. MonsterASP.NET plan compatibility has not been verified. Upload server sources, install production dependencies, configure environment values and run the start command supported by the host.
- Set `NODE_ENV=production`, `CLIENT_ORIGIN` to the exact frontend origin, verified PostgreSQL TLS settings, and the correct reverse-proxy hop count for the host.
- Prefer `app.yourdomain.com` and `api.yourdomain.com` to keep cookies on the same site. Unrelated hosting domains can encounter browser third-party cookie restrictions.
- Before public release, exercise the live flow, verify SMTP sender/domain authentication, configure database backups and scheduled deletion of expired verification/session rows, and use a shared rate-limit store if running multiple backend instances. The current rate limiter is per process.

## Current status

Dependencies installed; frontend production build and both server security tests pass. The frontend runs locally. Hosting, database, and email service have not been configured. SupportDesk is placeholder branding. Ticket management and password recovery are future stages.
