# Visitor Log System — Implementation Plan

Generated from the build prompt and scope documents (`scoopofwork/Visitor Log System Short Scope.md`, `scoopofwork/sidebar links design.md`).

## Current architecture summary

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite 8, React Router 7, Tailwind CSS v4 |
| Backend | Express 5, custom JWT (HMAC-SHA256), PBKDF2 passwords |
| Database | MySQL 8 via `mysql2` connection pool (no ORM) |
| Auth | Bearer JWT + RBAC permission keys in token claims |
| Shared | `shared/rbacPermissions.js`, `shared/portalNavigation.js` |

### Repository layout (relevant)

```
WGVL/
├── server/
│   ├── index.js              # Boot, CORS, auth middleware, routes
│   ├── schema.js             # Users + bootstrap
│   ├── visitorSchema.js      # Visitor domain tables + seed
│   ├── rbacService.js        # Roles/permissions tables
│   ├── auditService.js       # Audit + visit events + scope lookup
│   ├── scopeService.js       # Tenant/record scope enforcement
│   └── routes/
│       ├── auth.js, admin.js, health.js
│       └── visitor.js        # Station, visits, vehicles, org admin
├── shared/
│   ├── rbacPermissions.js
│   └── portalNavigation.js
├── src/
│   ├── layouts/PortalLayout.jsx
│   ├── pages/station/        # Operational portal (Phase 1 slice)
│   ├── pages/admin/          # Administration portal
│   └── context/AuthContext.jsx
└── docs/                     # This plan + status
```

## Reusable template features (preserved)

- AdminStatCard, DataTable, Card, FormField, StatusBadge, PageHeader
- Dark mode (ThemeContext), toast notifications, idle session timeout
- JWT login flow, RBAC tables, permission-gated API routes
- Responsive sidebar layout pattern (now `PortalLayout`)

## Gap assessment vs scope documents

### Implemented (Phase 1 partial)

| Area | Status |
|------|--------|
| Multi-portal routing (`/platform`, `/admin`, `/security`, `/station`, …) | Shell + sidebars |
| Station portal: dashboard, register, check-in/out, logs, occupancy | Functional |
| Admin portal: org dashboard, sites/stations/hosts/categories/badges lists | Read-only lists |
| DB: organisations, sites, stations, visitors, visits, events, vehicles, badges | Created |
| RBAC roles: super_admin, org_admin, receptionist, security_manager, host, … | Seeded |
| Append-only visit_events + audit_logs | Partial |
| Duplicate active check-in prevention | Server-side |
| Badge issue/return on check-in/out | Server-side |

### Not yet implemented (Phase 1 remaining)

| Area | Priority |
|------|----------|
| Full tenant scope enforcement on every API | P0 |
| DB transactions for check-in/badge/approval | P0 |
| Visit detail + event timeline UI | P0 |
| Seed: 2 sites, per-portal dev users, sample visits | P0 |
| Host portal (invite, approve) | P1 |
| Security portal (occupancy, watchlist, incidents) | P1 |
| Notifications service | P1 |
| Emergency roll call | P1 |
| Reports + Excel/PDF export with masking | P1 |
| Privacy notice acknowledgement | P1 |
| Contractors, deliveries, watchlist, incidents tables | P1 |
| MFA, rate limiting on all routes | P2 |
| Automated test suite | P0 |
| Kiosk / visitor self-service | P2 |

## Database changes (planned)

Already created — extend with:

- `notifications` table
- `watchlist_entries`, `incidents`, `deliveries`, `privacy_acknowledgements`
- `emergency_roll_calls`, `roll_call_entries`
- `report_exports`
- Foreign keys from visits → organisations/sites (add in migration pass)
- Unique partial index: one active `checked_in` visit per visitor per org

## Route / page map

See `shared/portalNavigation.js` for full sidebar definitions.

| Prefix | Primary users | Phase 1 focus |
|--------|---------------|---------------|
| `/station/*` | Guards, reception | **Complete vertical slice** |
| `/admin/*` | Org/site admins | Configuration CRUD |
| `/host/*` | Employees | Approvals + invite |
| `/security/*` | Security managers | Occupancy, queue, incidents |
| `/management/*` | Executives | Read-only analytics |
| `/compliance/*` | Auditors | Audit trail search |
| `/emergency/*` | Emergency officers | Roll call |
| `/platform/*` | Platform admins | Multi-tenant admin |
| `/visit/invite/:token`, `/kiosk/*` | Visitors | Phase 2 |

## Implementation phases

### Phase A — Foundation (current)

- [x] Portal navigation config + RBAC permissions
- [x] Visitor domain schema + demo seed
- [x] Station API + UI vertical slice
- [ ] Scope enforcement middleware
- [ ] Transactions for concurrency-sensitive actions
- [ ] Visit detail timeline
- [ ] Dev seed users per portal
- [ ] Basic automated tests

### Phase B — Host + approvals

- Host invite/pre-register API
- Host approval queue (scoped to own visitors)
- Notification records (in-app; email adapter stub)

### Phase C — Security + emergency

- Live occupancy by zone
- Watchlist + incident management
- Emergency roll call events

### Phase D — Reports + compliance

- Filtered reports with pagination
- Export audit + field masking
- Retention/legal hold tables

### Phase E — Hardening

- MFA for privileged roles
- Full test coverage per build prompt Step 16
- Production deployment docs

## Risks, assumptions and blockers

| Item | Notes |
|------|-------|
| No ORM | Migrations are `CREATE TABLE IF NOT EXISTS`; formal migration tool TBD |
| No test DB in CI yet | Tests use `DB_NAME` must contain `test` or `_test` |
| MFA | Not in template; Phase E unless Supabase/Auth0 added |
| Excel export | Requires library (e.g. `exceljs`) — Phase D |
| Existing DB seed skip | Re-seed requires empty `organisations` table or manual reset |

## Verification commands

```bash
# Install
npm install

# Frontend build
npm run build

# API (requires MySQL + .env)
npm run server:dev

# Frontend dev
npm run dev

# Tests (requires test database)
npm test
```

Default dev accounts (after seed): see `docs/IMPLEMENTATION_STATUS.md`.
