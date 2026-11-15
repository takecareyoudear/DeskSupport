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

For mobile testing on the same network, open `http://<computer-LAN-IP>:5173` on your phone. Vite listens on all interfaces and proxies `/api` to the local API, so login cookies work on the phone's chosen address. Leave `VITE_API_URL` blank and use `CLIENT_ORIGIN=http://localhost:5173` for this development setup. Allow inbound TCP port 5173 from the local subnet in Windows Firewall. Keep both development servers running.

The API creates the initial tables on startup. The database user must have table creation permissions. There are no fake OTPs or development bypasses: SMTP must be configured to register.

## Settings and organizations

Each verified public signup now collects a unique username and creates an organization with a unique six-digit ID (100000-999999). The first user is the organization admin. Sign in with either username or email and password. The organization ID appears after signup and in Settings and the profile.

Open **Settings → Master** to create, edit, update, and delete **Department**, **Category**, and **Project** records. These are independent lists, each with a required foreign key to its organization. Names are unique within each list and organization, ignoring case. Records referenced by foreign keys cannot be deleted. Future ticket relations should reference `(organization_id, id)` to enforce organization isolation.

Admins can open **Settings → Users** to create member logins using full name, username, email, and an initial password of at least 12 characters. Choose **User** or **Admin** when creating a login; User is the default. Both join the creating admin's organization. Users can view Master lists; admins can change Master records and create user or admin logins. Admins can edit names and roles from Settings ? Users ? Edit, and optionally set a new password. Username and email are immutable after creation. Password changes revoke existing sessions and pending reset codes. An organization must retain at least one admin. Usernames and emails are globally unique. Public registration creates a separate organization; use Settings to add people to an existing organization.

On API restart/deployment, `server/src/organizations.sql` applies the schema migration automatically. Existing accounts each receive their own organization and an automatically generated `user_<UUID>` username (shown in the profile); their current email/password login continues working. Back up the database before deploying schema changes. Six-digit IDs use a PostgreSQL sequence and never repeat; registration cannot create new organizations after this range is exhausted.

The PostgreSQL integration test uses an isolated in-memory PGlite database, not the configured live database. It checks repeatable migrations, existing-account migration, registration transactions, login, independent Master CRUD, foreign-key restrictions, permissions, and organization isolation. Run `npm test --workspace server` and `npm run build`.

## Assets

Open **Assets** from the home screen. Admins can create, view, edit, and delete organization-scoped **Category master** and **Asset register** records. Members have read-only access.

When creating an asset, select **Movable**, **Immovable**, or **Virtual**, then choose a matching category. **Category master** supports CRUD: enter a category name (Car/Bike, Staff, Building, Subscription, Shop, Apartment, Home, or another name), its asset type, and whether it is a subscription. The category dropdown filters by type and clears when the type changes.

Subscription assets require an expiry date and recurring renewal schedule. Choose monthly (day only) or yearly (month and day); no renewal year is entered. The information view calculates the next renewal date including its year, using the viewer's local calendar date. Renewals due today remain due today; short months use their last day (including February 29 schedules in non-leap years). Insurance renewal uses the same schedule. Existing full renewal dates migrate to yearly schedules; expiry dates remain full dates. Every asset supports multiline remarks, shown in the register, plus optional insurance details. Category type/subscription settings cannot change while the category is used; rename is allowed. Existing records and legacy insurance/date fields are preserved by a repeatable startup migration. Automatic reminders are not implemented.

The API applies `server/src/assets.sql` at startup. Vercel bundles all SQL migrations. Integration checks cover category and asset CRUD, type/category matching, required subscription dates, multiline remarks, master deletion restrictions, organization isolation, and role permissions.

## Payble

Open **Payble** on the home screen to manage recurring expenses such as telephone bills. Admins can create, view, edit, and delete expenses in their organization; members can view them. Each expense records name, positive amount (up to two decimal places), currency (INR by default), weekly/monthly/yearly frequency, first due date, and multiline remarks.

The list shows the next scheduled due date including its year. Weekly repeats every seven days from the first due date; monthly and yearly follow its day/month, clamping to the last day of shorter months. The first due date is respected for future schedules and today is included. Payment history, overdue balances, reminders, and automatic payments are not implemented. The API applies the repeatable `server/src/payables.sql` migration at startup.

## Authentication checks

Password recovery is available from **Forgot password?** on the login form. A separate, hashed six-digit email code expires after ten minutes, allows five guesses, and has a sixty-second resend cooldown. Resetting the password consumes the code and revokes all existing sessions. The API creates the `password_resets` table on startup. Recovery uses the existing SMTP settings and returns the same send response for registered and unknown addresses.

The automated recovery route test uses an in-memory database double and mail capture. Before deployment, verify delivery with the configured SMTP service and exercise reset, old-password rejection, new-password login, code reuse rejection, and session revocation against PostgreSQL.

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

Dependencies installed; frontend production build and server tests pass. The frontend runs locally. SupportDesk is placeholder branding. Password recovery is implemented; ticket management is a future stage.
