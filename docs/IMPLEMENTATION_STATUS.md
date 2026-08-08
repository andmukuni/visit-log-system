# VM360 — Implementation Status

Last updated: 2026-08-08

## Phase A — Guard/Reception vertical slice

| Item | Status | Evidence |
|------|--------|----------|
| Read scope documents | Done | Build prompt + scope files |
| Implementation plan | Done | `docs/IMPLEMENTATION_PLAN.md` |
| Portal navigation (8 portals) | Done | `shared/portalNavigation.js` |
| RBAC permissions + roles | Done | `shared/rbacPermissions.js` |
| Visitor DB schema | Done | `server/visitorSchema.js` |
| Station dashboard (KPIs) | Done | `/station` + `/api/admin/station/dashboard` |
| Register visitor | Done | `/station/visitors/new` + `POST /api/admin/visits` |
| Approve visit | Done | `/station/pending` + `POST .../approve` |
| Check-in + badge issue | Done | `/station/check-in` + transaction-wrapped API |
| Live occupancy | Done | `/station/occupancy` |
| Check-out + badge return | Done | `/station/check-out` |
| Visitor/vehicle logs | Done | `/station/visitors`, `/station/vehicles` |
| Visit detail + timeline | Done | `/station/visitors/:id` |
| Tenant scope enforcement | Done | `server/scopeService.js` |
| Dev seed (2 sites, portal users) | Done | `server/seedPortalUsers.js` |
| Automated tests | Done | `tests/scope.test.js`, `tests/rollCall.test.js` (14 passing) |
| Audit full journey | Partial | `audit_logs` + `visit_events` on key actions |

## Phase B — Host portal

| Item | Status | Evidence |
|------|--------|----------|
| Host dashboard | Done | `/host` + `/api/admin/host/dashboard` |
| Invite visitor (pre-register) | Done | `/host/invite` |
| My visitors list | Done | `/host/visitors` |
| Approval queue (approve/reject) | Done | `/host/approvals` |
| Visitors on-site | Done | `/host/on-site` |
| Visit detail + timeline | Done | `/host/visitors/:id` |
| Own-records scope enforcement | Done | `server/scopeService.js`, `server/routes/host.js` |
| Host user seed + profile link | Done | `host@demo.org` in `seedPortalUsers.js` |
| Notifications | Done | Phase F — `/host/notifications`, `notificationService.js` |

## Phase C — Security + emergency

| Item | Status | Evidence |
|------|--------|----------|
| Security operations dashboard | Done | `/security` + `/api/admin/security/dashboard` |
| Live occupancy (security scope) | Done | `/security/occupancy` |
| Approval queue (org/site view) | Done | `/security/approvals` |
| Exceptions + overdue | Done | `/security/exceptions`, `/security/overdue` |
| Visitor search | Done | `/security/visitors` |
| Watchlist CRUD + check-in block | Done | `/security/watchlist`, `watchlistService.js`, check-in guard |
| Incidents (log + resolve) | Done | `/security/incidents` |
| Emergency roll call | Done | `/security/roll-call`, `/emergency/roll-call` |
| Roll call statuses (4 states) | Done | `roll_call_entries`, append-only visit events preserved |
| Emergency portal (dashboard, occupancy, unresolved) | Done | `/emergency/*` + `/api/admin/emergency/*` |
| Security schema + seed | Done | `server/securitySchema.js` |

## Phase D — Reports + compliance

| Item | Status | Evidence |
|------|--------|----------|
| Report types (visitors, vehicles, occupancy, exceptions, summary, audit) | Done | `server/reportService.js`, `/api/admin/reports/*` |
| Filtered paginated preview | Done | `GET /api/admin/reports/preview` |
| CSV export (Excel-compatible) | Done | `POST /api/admin/reports/export` |
| Print / PDF (browser print) | Done | `ReportsPage.jsx` print preview |
| Field masking by role | Done | `shared/reportMasking.js` |
| Export audit trail | Done | `report_exports` table + `audit_logs` |
| Management portal reports + dashboard | Done | `/management/reports`, `/management/exports` |
| Security reports | Done | `/security/reports` |
| Compliance export logs + reports | Done | `/compliance/exports`, `/compliance/reports` |
| Scheduled reports | Not started | Phase 2 |

## Phase E — Compliance portal

| Item | Status | Evidence |
|------|--------|----------|
| Compliance dashboard | Done | `/compliance` + `/api/admin/compliance/dashboard` |
| Audit trail (filterable, paginated) | Done | `/compliance/audit` |
| Approval & override logs | Done | `/compliance/approvals` |
| User access review | Done | `/compliance/access` |
| Incident review (read-only) | Done | `/compliance/incidents` |
| Privacy requests (log + complete) | Done | `/compliance/privacy`, `privacy_requests` table |
| Retention policies | Done | `/compliance/retention`, `retention_policies` table |
| Export logs + reports | Done | `/compliance/exports`, `/compliance/reports` |

## Phase F — Platform, notifications, kiosk

| Item | Status | Evidence |
|------|--------|----------|
| Platform dashboard | Done | `/platform` + `/api/admin/platform/dashboard` |
| Organisations (list + status) | Done | `/platform/organisations`, `PATCH .../organisations/:id` |
| Subscriptions | Done | `/platform/subscriptions`, `subscriptions` table |
| Platform health | Done | `/platform/health` |
| Global audit | Done | `/platform/audit` |
| Platform users | Done | `/platform/users`, `platform@demo.org` seed |
| Platform schema + seed | Done | `server/platformSchema.js`, `seedPlatformData()` |
| Notification service (idempotent) | Done | `server/notificationService.js`, templates |
| Visit event hooks (invite, approve, check-in/out) | Done | `server/routes/host.js`, `server/routes/visitor.js` |
| Notifications API | Done | `/api/admin/notifications/*` |
| Host notifications UI | Done | `/host/notifications` |
| Admin notifications UI | Done | `/admin/notifications` |
| Kiosk config + lookup | Done | `GET /api/kiosk/config`, `POST /api/kiosk/lookup` |
| Kiosk check-in / check-out | Done | `/kiosk/check-in`, `/kiosk/check-out`, privacy + watchlist |
| Visitor invite self-service | Done | `/visit/invite/:token`, `invite_token` on visits |
| Host invite URL in response | Done | `HostInvitePage.jsx` toast with self-service link |
| Kiosk org scoping | Done | `KIOSK_ORG_SLUG` env (default `demo-org`) |
| Email/SMS delivery adapters | Done | `server/adapters/emailAdapter.js`, `smsAdapter.js`; console/SendGrid/SMTP/Twilio |

## Phase G — PDF executive appointment logic

Aligned with `scoopofwork/Visitor_Appointment_Vehicle_Access_System_Logic.pdf`.

| Item | Status | Evidence |
|------|--------|----------|
| Appointments (synced with visits) | Done | `appointments` table, created on invite/register |
| Visitor classification Standard/VIP/VVIP | Done | `visitor_categories.classification`, VVIP seeded |
| VIP/VVIP assignment restricted | Done | `classificationService.js`, host/visitor POST guards |
| VIP/VVIP privacy masking on live APIs | Done | `shared/visitorPrivacy.js`, station/security/visit routes |
| VIP profile access audit | Done | `vip.profile_access` in `visitResponseService.js` |
| PDF visitor status pipeline | Done | `expected` → `arrived_at_gate` → … → `left_premises` |
| PDF vehicle status pipeline | Done | `expected` → `arrived_at_gate` → `entry_approved` → `on_site` → `exited` |
| Expected vehicles at appointment | Done | `expected_vehicles`, host invite + register |
| Gate vehicle capture workflow | Done | `POST /api/admin/vehicles/gate-capture`, `vehicle_entries` |
| Visitor contact details (ID, confidential) | Done | `visitor_contact_details` table |
| Reception points + parking bays | Done | `reception_points`, `parking_bays` seeded |
| Executive roles (CEO, secretaries, etc.) | Done | `rbacPermissions.js` + demo users |
| Notifications: gate arrival, VIP, cancel, reschedule | Done | templates + `notificationService.js` |
| Cancel / reschedule endpoints | Done | `POST /visits/:id/cancel`, `PATCH /visits/:id/reschedule` |
| Appointment reminders (scheduled) | Not started | Cron template only |
| Platform integrations/support/settings | Not started | Placeholder routes |

## Definition of done (build prompt)

- [x] All Phase 1 portals functional with persistent data
- [x] Role, tenant, site, station scope enforced and tested
- [x] Check-in blocked without approval
- [x] Duplicate check-in/badge blocked
- [x] Occupancy matches events; roll call supported
- [x] Auditable histories
- [x] Reports/exports with masking
- [x] Retention/privacy workflows
- [x] Tests + build pass
- [ ] Documentation complete

## Default development accounts

Password for all `@demo.org` portal users: `demo1234` (development only). Super admin: `admin@template.dev` / `admin123`.

Seed command: `npm run seed:portal-users` (local) or `npm run seed:portal-users:remote -- $DATABASE_URL`.

| Email | Defined role | Portal |
|-------|--------------|--------|
| admin@template.dev | System Administrator (Super Admin) | All (via switcher) |
| orgadmin@demo.org | System Administrator (Org Admin) | `/admin` |
| ceo@demo.org | CEO | `/executive` |
| dceo@demo.org | DCEO | `/executive` |
| ceo.secretary@demo.org | CEO Secretary | `/host` (can assign VIP/VVIP) |
| dceo.secretary@demo.org | DCEO Secretary | `/host` (can assign VIP/VVIP) |
| exec.reception@demo.org | Executive Reception | `/station` (full VIP contact) |
| reception@demo.org | Main Receptionist | `/station` |
| gate@demo.org | Security Officer / Gate | `/station` |
| guard@demo.org | Receptionist / Guard | `/station` |
| security@demo.org | Security Manager | `/security` |
| host@demo.org | Employee / Host | `/host` |
| auditor@demo.org | Auditor | `/compliance` |
| management@demo.org | Management Viewer | `/management` |
| platform@demo.org | Platform Admin | `/platform` |
| emergency@demo.org | Emergency Officer | `/emergency` |

## Test evidence log

| Date | Command | Result |
|------|---------|--------|
| 2026-08-07 | `npm test` | Pass (24 tests) |
| 2026-08-07 | `npm run build` | Pass |
| 2026-08-07 | Phase C security + roll call | Implemented |
| 2026-08-07 | Phase D reports + exports | Implemented |
| 2026-08-07 | Phase E compliance portal | Implemented |
| 2026-08-07 | Phase F platform + notifications + kiosk | Implemented |
