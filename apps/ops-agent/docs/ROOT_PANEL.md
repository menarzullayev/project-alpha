# Root (super-admin) panel

`/root` is the operator console for the people who run the OpsAgent platform itself. Workspace
owners manage their own education centre in `/dashboard`. The root panel works across all
tenants: accounts, organizations, platform settings, announcements, audit and reports.

## 1. Goals and scenarios

| # | Scenario | Who | Where |
| --- | --- | --- | --- |
| S1 | Check platform health and growth each morning (orgs, users, messages, AI automation rate, failed webhooks/deliveries, Telegram errors) | all operators | Overview |
| S2 | Find a customer by email and see their workspaces, sessions and 2FA state | support+ | Users → detail |
| S3 | Create an account for a centre, optionally attach it to a workspace with a role, and hand over a one-time password | admin+ | Users → Add user |
| S4 | A customer is locked out: reset their password (one-time, forced change) or sign them out everywhere | admin+ | User detail |
| S5 | Abuse or fraud: suspend a user (signed out, cannot sign in) or a whole organization (dashboard/API blocked, Telegram agent stops replying) | admin+ | User / organization detail |
| S6 | Upgrade or downgrade a centre's plan | admin+ | Organization detail |
| S7 | Announce maintenance or an incident to every workspace, or to owners only, now or on a schedule | admin+ | Announcements; Settings → maintenance banner |
| S8 | Close public sign-up, change session lifetime, 2FA policy or plan defaults | superadmin | System settings |
| S9 | Grant or revoke platform roles; reset an operator's lost 2FA device | superadmin | User detail |
| S10 | Compliance/finance export: organizations & usage, users, daily growth, audit trail (CSV) | support+ (audit: admin+) | Reports, Audit log |
| S11 | Investigate who did what, and when | admin+ | Audit log (filter + CSV) |

## 2. Roles and permissions (platform RBAC)

Platform roles are separate from workspace roles (`owner › admin › operator › viewer`). A customer
account has no platform role and gets **404** on `/root` and **403** on `/api/root/*`.

| Permission | support | admin | superadmin |
| --- | :-: | :-: | :-: |
| `platform:read`: overview, settings (read), announcements (read) | ✓ | ✓ | ✓ |
| `users:read`, `orgs:read`, `reports:read` | ✓ | ✓ | ✓ |
| `users:write`: create, edit, reset password, memberships | | ✓ | ✓ |
| `users:suspend`: suspend/reactivate, revoke sessions | | ✓ | ✓ |
| `orgs:write` (name, plan), `orgs:suspend` | | ✓ | ✓ |
| `announcements:write` | | ✓ | ✓ |
| `audit:read`, including the audit CSV report | | ✓ | ✓ |
| `platform_roles:assign`: grant/revoke roles, reset another operator's 2FA | | | ✓ |
| `settings:write` | | | ✓ |

Invariants enforced in the service layer (`src/server/platform/users.ts`), not only in the UI:

- Only a superadmin can manage accounts that hold a platform role. Admins cannot edit, suspend,
  reset or sign out other admins or superadmins.
- Nobody can change their own platform role or suspend themselves.
- The platform always keeps at least one active superadmin.
- A workspace always keeps at least one owner.

The table lives in `src/server/platform/rbac.ts` and is checked by `tests/unit/platform.test.ts`
against an independent expectation table.

## 3. Authentication and security

| Control | Implementation |
| --- | --- |
| Sign-in | The same email/password session as the app (scrypt, SHA-256-hashed 256-bit session tokens, HttpOnly + Secure + SameSite=Lax cookie) |
| **Mandatory 2FA** | TOTP (RFC 6238, SHA-1, 30 s, 6 digits; `src/server/lib/totp.ts`, verified against the RFC test vectors). Enrollment shows a QR code and a manual key. The secret is stored AES-256-GCM encrypted. Every session must pass a TOTP challenge before using the panel, and again every `rootSessionMfaHours` (default 12 h) |
| Brute force | TOTP endpoints: 10 attempts / 10 min per user, and failed challenges are audited. Root API: 300 req/min per user. Login keeps its per-IP and per-email limits |
| CSRF | `Origin` must match the deployment on every mutating request |
| Least privilege | Every `/api/root/*` handler is wrapped by `rootRoute({ permission })`, and every page calls `requireRoot(permission)` |
| One-time passwords | Accounts created or reset by an operator get a random 16-character password, shown once. `mustChangePassword` blocks the dashboard and API (`password_change_required`) until `/account/password` succeeds. Changing it revokes every other session |
| Suspension | A suspended user's sessions are deleted and login returns `account_suspended`. For a suspended organization, members get `organization_suspended` (403) and the `/suspended` page, and its Telegram webhook acknowledges updates without processing them |
| Audit | Every root mutation, report export, 2FA enrolment and failed challenge writes `platform_audit_logs` (actor, action, target, metadata, IP, user agent) |
| Exposure | `/root` is `noindex`. Secrets (password hash, TOTP secret) are never returned by the API. CSV exports neutralise spreadsheet formulas |

### Bootstrapping the first superadmin

There is deliberately no self-service path to a platform role. Run, with the production database
URL in the environment:

```bash
npm run root:grant -- you@example.com superadmin "Your Name"
```

If the account does not exist, it is created with a temporary password (printed once, must be
changed at first sign-in). Then sign in, open `/root` and enrol 2FA. Use
`npm run root:grant -- email none` to revoke a role.

## 4. UI

- Next.js App Router server components, with client components only for interactive controls.
  Tailwind v4; the root panel scopes its own `dark` class, so the customer dashboard is unaffected.
- **Navigation:** grouped sidebar (Monitor / Manage / Govern) filtered by permission. On phones
  it becomes a drawer, with no horizontal scroll at 390 px.
- **Themes:** light, dark and system, stored in the `ops_theme` cookie and rendered on the server
  so there is no flash.
- **Languages:** Uzbek (default), Russian and English, from the `ops_lang` cookie and then
  `Accept-Language`. All strings are in `src/lib/i18n/root-dict.ts`, typed so that a missing key
  fails the build.
- Lists are filterable and paginated. Destructive actions ask for confirmation, and suspensions
  require a reason.

## 5. Data model (migration `drizzle/0001_root_panel.sql`, additive only)

| Table / column | Purpose |
| --- | --- |
| `users.platform_role` (`superadmin`/`admin`/`support`, nullable) | platform role |
| `users.status`, `suspended_at`, `suspended_reason` | account suspension |
| `users.totp_secret_encrypted`, `totp_enabled_at` | 2FA |
| `users.must_change_password` | forced password change |
| `sessions.mfa_verified_at` | per-session 2FA freshness |
| `organizations.plan` (`free`/`pro`/`enterprise`), `status`, `suspended_at`, `suspended_reason` | plans and suspension |
| `platform_audit_logs` | immutable root-panel audit trail (indexed by time, actor, action, target) |
| `platform_settings` (`key` PK, `value` jsonb) | typed settings, validated by zod with defaults |
| `announcements` (`title`, `body`, `severity`, `audience`, `starts_at`, `ends_at`) | broadcast banners shown in every workspace |

## 6. API (`/api/root/*`)

All endpoints need a signed-in operator with a fresh 2FA verification, except the `mfa/*` ones.
Errors: `forbidden`, `mfa_setup_required`, `mfa_required`, `password_change_required` (403).

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/overview` | platform:read |
| GET / POST | `/users` (`?q&role&status&limit&offset`) | users:read / users:write |
| GET / PATCH | `/users/:id` (`{name?,email?,platformRole?}`) | users:read / users:write (+ platform_roles:assign for roles) |
| POST | `/users/:id/status` (`{status:"suspended",reason}` or `{status:"active"}`) | users:suspend |
| POST | `/users/:id/password-reset` → `{temporaryPassword}` | users:write |
| DELETE | `/users/:id/sessions` | users:suspend |
| DELETE | `/users/:id/mfa` | platform_roles:assign |
| POST / DELETE | `/users/:id/memberships`, `/users/:id/memberships/:orgId` | users:write |
| GET | `/organizations` (`?q&plan&status`) | orgs:read |
| GET / PATCH | `/organizations/:id` (`{name?,plan?}`) | orgs:read / orgs:write |
| POST | `/organizations/:id/status` | orgs:suspend |
| GET / PATCH | `/settings` | platform:read / settings:write |
| GET / POST | `/announcements`; DELETE `/announcements/:id` (ends it) | platform:read / announcements:write |
| GET | `/audit` (`?q&action&since&before&limit&format=csv`) | audit:read |
| GET | `/reports?type=organizations\|users\|growth\|audit&days=1..365` → CSV | reports:read (audit: audit:read) |
| POST | `/mfa/setup`, `/mfa/enable` `{code}`, `/mfa/verify` `{code}` | any operator, 2FA not yet required |

Workspace-side additions: `POST /api/v1/auth/change-password` `{currentPassword,newPassword}`, and
`/login?next=/root` (same-origin paths only).

## 7. Tests

- `tests/unit/platform.test.ts`: RFC 6238 vectors, clock drift, the RBAC matrix, CSV
  formula-injection, and open-redirect protection.
- `tests/integration/root-panel.test.ts` (16 tests):
  - anonymous, customer and support boundaries;
  - 2FA enrolment and per-session challenge;
  - the CSRF origin check;
  - one-time passwords and forced change;
  - role assignment rules and admin-vs-operator protection;
  - user and organization suspension, including the Telegram webhook ignore;
  - settings effects and audit;
  - announcements audience and scheduling;
  - CSV reports.
- `e2e/root.spec.ts`: a customer gets 404, then the real browser flow — TOTP enrolment, create
  user, suspend, audit log, language switch and dark mode that persists across a reload.
