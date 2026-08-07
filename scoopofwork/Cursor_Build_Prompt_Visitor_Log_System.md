# Cursor Build Prompt — Visitor Log and Access-Control System

Copy everything below into Cursor Agent while the project is open at:

`/Users/majormacs/Projects/WGVL`

---

You are working inside the existing project located at:

`/Users/majormacs/Projects/WGVL`

Your task is to build a complete, production-ready **Visitor Log and Physical Access-Control System** on top of the template that already exists in this project.

## Mandatory source documents

Before making any changes, read these two files completely:

1. `/Users/majormacs/Projects/WGVL/scoopofwork/Visitor Log System Short Scope.md`
2. `/Users/majormacs/Projects/WGVL/scoopofwork/sidebar links design.md`

Treat these documents as the functional source of truth for:

- portals and users;
- roles, permissions and access scopes;
- visitor and system-user data journeys;
- visitor, vehicle, contractor and delivery workflows;
- sidebar links and page structure;
- security, privacy, audit and reporting requirements;
- Phase 1 acceptance criteria.

If the documents conflict with the current template, preserve all working template functionality and document the conflict and proposed resolution before making a destructive architectural change.

## Main objective

Convert the existing template into a working multi-site visitor-management system without rebuilding the user interface from scratch.

The completed system must support:

- platform, organisation and site administration;
- security management;
- guards and receptionists;
- employees and visitor hosts;
- management reporting;
- audit and compliance;
- emergency operations;
- visitor self-service and kiosk check-in;
- visitor and vehicle registration;
- host and security approvals;
- check-in and checkout;
- badges and QR passes;
- live occupancy and emergency roll call;
- contractors, suppliers and deliveries;
- watchlists, incidents and access exceptions;
- notifications, reports, exports and immutable audit logs.

## Non-negotiable implementation rules

1. Build on the existing template and reuse its layouts, components, theme, typography, routing patterns and design tokens.
2. Do not replace the project stack unless a genuine blocker is identified and documented.
3. Inspect the repository before coding. Determine the actual frontend, backend, database, authentication, testing and deployment stack from the existing files.
4. Follow the existing naming, folder, formatting and component conventions.
5. Do not leave core Phase 1 features as mock screens, fake buttons or static arrays.
6. Development seed data is allowed, but production workflows must use the database and real APIs/services.
7. Enforce permissions on the server/API. Hiding a button in the UI is not sufficient access control.
8. Deny access by default. Every request must validate the user's account, role, permission, organisation, site/station scope and record scope.
9. Never trust organisation, site, role or user identifiers supplied by the browser without server-side validation.
10. Keep tenant data isolated. A user from one organisation must never access another organisation's records.
11. Use database transactions and constraints for check-in, checkout, badge issue, approvals and other concurrency-sensitive actions.
12. Operational records and audit events must not be permanently deleted through normal user screens.
13. Do not store plain-text passwords, authentication tokens or secrets.
14. Do not log passwords, full tokens, full identification numbers or other unnecessary sensitive data.
15. Do not run destructive database commands against an unidentified or production database.
16. Preserve existing user work and unrelated repository changes.

## Step 1 — Repository and requirements assessment

Before implementation:

1. Read both mandatory source documents in full.
2. Inspect the complete project structure and relevant configuration files.
3. Read any `README`, `AGENTS.md`, `.cursor/rules`, architecture documents and environment examples.
4. Identify:
   - frontend framework and version;
   - backend/API framework;
   - database and ORM/query layer;
   - authentication/session mechanism;
   - current routing and layouts;
   - reusable UI components;
   - existing role/permission implementation;
   - test tools and available scripts;
   - current environment and deployment assumptions.
5. Compare the existing template with the two scope documents.
6. Create or update `docs/IMPLEMENTATION_PLAN.md` with:
   - current architecture summary;
   - reusable template features;
   - missing features;
   - database changes;
   - route/page map;
   - implementation phases;
   - risks, assumptions and blockers;
   - verification commands.
7. Create or update `docs/IMPLEMENTATION_STATUS.md` and maintain a checklist as work progresses.

After writing the plan, continue implementing unless a missing business decision, missing credential or destructive change genuinely requires confirmation.

## Step 2 — Architecture and multi-tenant foundation

Implement or complete the foundation for:

- organisations;
- sites/branches;
- buildings, floors and physical access zones;
- reception desks, gates and guard stations;
- departments;
- employees/hosts and host delegates;
- users, roles, permissions and scoped role assignments;
- visitor categories and configurable approval rules;
- application settings per organisation and site.

Every tenant-owned table must have a trusted organisation relationship. Site-specific records must also have a site relationship where applicable.

Add indexes, foreign keys, unique constraints and check constraints appropriate to the actual database.

## Step 3 — Authentication and access control

Implement the access-control model described in the scope document.

At minimum, support these roles:

- Platform Administrator
- Organisation Administrator
- Site Administrator
- Security Manager
- Security Supervisor
- Guard / Receptionist
- Employee / Host
- Department Approver
- Management Viewer
- Auditor / Compliance Officer
- Emergency Officer

Implement role-aware portal access and data scopes:

- global;
- organisation;
- site;
- station;
- department;
- own records;
- assigned records;
- physical zones.

Requirements:

- unique user accounts; no shared guard accounts;
- secure password hashing;
- MFA support for privileged roles if supported by the current stack;
- session expiry and revocation;
- account activation, suspension, expiry and deactivation;
- privileged-action re-authentication where practical;
- periodic access-review records;
- prevention of self-approval and self-assignment of privileged roles;
- server-side route, action and record-level authorization tests.

Administrator roles must remain non-operational by default. An administrator can perform reception/security operations only if separately assigned an operational role.

## Step 4 — Core database and domain model

Implement migrations/models/entities for the source document's data model, adapting names to the existing project conventions.

The model should include, where required:

- Organisation
- Site
- Building
- Zone
- Station
- Department
- User
- Role
- Permission
- Role Assignment
- Employee/Host
- Host Delegate
- Visitor
- Visitor Category
- Visit
- Group Visit
- Approval
- Visit Event
- Vehicle and Vehicle Visit
- Badge/Pass and Badge Assignment
- Contractor Document
- Watchlist Entry
- Incident
- Notification
- Privacy Notice and Acknowledgement
- Attachment
- Legal Hold
- Privacy Request
- Audit Event
- Integration Event
- Report Export

Keep the reusable visitor profile separate from individual visit records. Do not duplicate a new visitor profile for every visit.

Use an append-only event history for approvals, visit status transitions, entry, exit, denials, overrides and corrections.

## Step 5 — Visitor workflow

Implement both pre-registration and walk-in journeys.

Required workflow:

1. Host invitation or walk-in registration.
2. Search for a returning visitor and safely prevent duplicates.
3. Capture the minimum required visitor information.
4. Show the privacy notice and record its version and acknowledgement.
5. Create the visit with host, department, site, purpose, date/time and requested zone.
6. Run the configured host, department and security approval process.
7. Validate visit expiry, watchlist status, documents, zone policy and duplicate active visits.
8. Issue a badge or time-limited QR pass.
9. Check the visitor in and add them to live occupancy.
10. Notify the host of arrival.
11. Track overdue visits and relevant incidents.
12. Check the visitor out, invalidate the pass and remove them from live occupancy.

Supported visit statuses must include:

- Pre-registered
- Pending Approval
- Approved
- Rejected
- Cancelled
- Denied
- Checked In
- Overdue
- Checked Out
- Completed
- Expired

Validate allowed state transitions on the server. Do not allow arbitrary status changes from the frontend.

## Step 6 — Vehicles, contractors and deliveries

Implement:

- visitor vehicle registration;
- plate number, type, make, model, colour and driver;
- entry and exit events;
- passengers and optional parking bay;
- contractor sponsor, job/reference, work area and supervisor;
- required contractor documents and expiry validation;
- courier/delivery workflow with sender, recipient, item reference and proof of handover;
- fast delivery processing without automatically granting unnecessary building access.

## Step 7 — Badge and QR-pass lifecycle

Implement badge states:

- Available
- Issued
- Returned
- Lost
- Damaged
- Blocked
- Expired

Prevent one badge from being assigned to multiple active visitors. Passes must become invalid after checkout, loss, blocking, cancellation or expiry.

QR tokens must be random, time-limited and safely stored or hashed according to the stack's security practices. A QR code must never directly expose sensitive visitor information.

## Step 8 — Portals and navigation

Build the portals and sidebar links defined in `sidebar links design.md` and the main scope.

Recommended route prefixes:

- `/platform/*`
- `/admin/*`
- `/security/*`
- `/station/*`
- `/host/*`
- `/management/*`
- `/compliance/*`
- `/emergency/*`
- `/visit/invite/:token`
- `/kiosk/check-in`
- `/kiosk/check-out`

Generate sidebars from permissions and access scopes. Do not maintain unsecured navigation as the only form of protection.

Adapt the existing template's UI into each portal. Avoid creating nine visually unrelated applications.

## Step 9 — Operational screens

Complete all Phase 1 screens, including:

- login, recovery and MFA;
- role-aware dashboards;
- new visitor and returning visitor registration;
- new vehicle registration;
- expected arrivals;
- host and security approval queues;
- visitor and vehicle activity logs;
- visit details and full event timeline;
- check-in and checkout;
- badge issue and return;
- current occupancy;
- overdue visitors;
- emergency roll call;
- contractor and delivery processing;
- watchlist management;
- incident and exception management;
- notifications;
- reports and exports;
- users, roles, sites, stations, departments and settings;
- audit logs;
- visitor self-service invitation and kiosk journeys.

Use clear loading, empty, success, warning, failure and permission-denied states. Every visible button must perform a real action or be explicitly marked as a future Phase 2 feature.

## Step 10 — Dashboard requirements

The guard/reception dashboard should preserve the visual direction of the current template and include:

- Visitors Today
- Vehicles Today
- Currently Inside
- Pending Approvals
- Overdue Visitors
- Denied/Rejected Entries
- New Visitor quick action
- New Vehicle quick action
- Expected Arrivals
- Recent Activity
- Notifications

Apply site/station and user-scope filtering to all values.

## Step 11 — Notifications and approvals

Create an internal notification service with adapters for supported email/SMS providers.

Required notifications include:

- visitor invitation;
- approval request;
- approval/rejection result;
- visitor arrival;
- overdue visitor;
- lost/unreturned badge;
- incident escalation;
- failed integration requiring attention.

Implement safe retry and idempotency so retries do not create duplicate visits, approvals, passes or notifications.

## Step 12 — Live occupancy and emergency roll call

Current occupancy must be derived from valid entry/exit events, not from an editable visitor status alone.

Implement:

- current visitors by site and zone;
- overdue highlighting;
- emergency event creation;
- roll-call statuses: Accounted For, Not Yet Accounted For, Left Site and Unknown;
- unresolved-person list;
- printable/exportable emergency list;
- closure of the emergency event with audit history.

Emergency roll-call results must not rewrite original check-in/out events.

## Step 13 — Reports and exports

Implement filtered, paginated reports for:

- daily, weekly, monthly and custom periods;
- visitors and vehicles;
- current occupancy;
- host and department activity;
- site and station activity;
- overdue visits;
- denied and rejected access;
- frequent visitors;
- peak visit times;
- contractor visits;
- badge status and unreturned badges;
- incidents and exceptions;
- user activity and audit events.

Support authorised preview and Excel/PDF export where the current stack allows it.

Exports must apply the same tenant, row and field permissions as on-screen results. Audit every export with the user, purpose, filters, format, timestamp and row count.

## Step 14 — Audit, privacy and retention

Create tamper-resistant audit events for:

- successful and failed authentication;
- user, role and scope changes;
- permission denials;
- visitor/vehicle creation and correction;
- approvals, rejections and overrides;
- watchlist matches;
- badge issue, return, loss and blocking;
- entry and exit;
- incidents;
- sensitive searches;
- report views and exports;
- privacy and retention actions;
- configuration changes.

For corrections, preserve the original value, new value, reason, user and timestamp.

Implement configurable retention categories, legal holds and authorised anonymisation/deletion. Do not delete audit evidence required by policy when visitor personal data is anonymised.

Mask sensitive fields according to the user's role. Never expose watchlist reasons to ordinary hosts, management viewers or unrelated users.

## Step 15 — Security requirements

Follow secure defaults appropriate to the existing stack:

- HTTPS assumptions in production;
- CSRF protection when cookie sessions are used;
- secure cookies/tokens;
- input validation and output encoding;
- safe file-upload validation and storage;
- rate limiting;
- brute-force protection;
- parameterised database access;
- tenant and object-level authorization;
- secure secret management;
- security headers;
- sensitive-data masking;
- dependency and vulnerability review.

Use OWASP ASVS as a verification reference. Do not claim compliance without testing.

## Step 16 — Testing requirements

Add automated tests using the repository's existing test tools.

At minimum, test:

- cross-tenant access is denied;
- cross-site/station access is denied;
- role and record-level permissions;
- administrator roles cannot perform operations without a separate operational role;
- self-assignment and self-approval are blocked;
- valid and invalid workflow transitions;
- duplicate visitor/profile handling;
- duplicate active check-in prevention;
- duplicate badge assignment prevention;
- expired, lost and blocked passes;
- approval escalation and rejection;
- check-in/out and live occupancy consistency;
- emergency roll call;
- field masking and report authorization;
- export audit events;
- immutable/corrective audit history;
- retention and legal hold;
- notification/integration idempotency;
- validation, authentication and important failure states.

Use a dedicated test database. Test setup must refuse destructive operations if the configured database is not clearly a test database.

## Step 17 — Seed data

Provide safe development seed data for:

- one sample organisation;
- two sites;
- departments, buildings, zones and stations;
- all primary roles;
- representative users for each portal;
- visitor categories;
- sample hosts, visitors, vehicles and visits;
- available/issued/lost badges;
- sample approvals, incidents and notifications.

Never run seeders automatically in production.

## Step 18 — Documentation and handover

Update or create:

- `README.md`
- environment-variable example file
- `docs/ARCHITECTURE.md`
- `docs/DATABASE_MODEL.md`
- `docs/ACCESS_CONTROL.md`
- `docs/API.md`
- `docs/DEPLOYMENT.md`
- `docs/TESTING.md`
- `docs/USER_GUIDE.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/IMPLEMENTATION_STATUS.md`

Document setup, migrations, seed commands, test commands, build commands, default development accounts and deployment requirements. Do not commit real credentials.

## Required working method

Work in clear phases and keep the application runnable after each phase.

For every phase:

1. State the objective.
2. List the files/modules being changed.
3. Implement the smallest complete vertical slice.
4. Run relevant tests, linting, type checking and builds.
5. Fix regressions introduced by the work.
6. Update `docs/IMPLEMENTATION_STATUS.md` with completed work, test evidence and remaining items.

Do not mark a feature complete merely because the page renders. Verify database persistence, server-side access control, validation, error handling and audit behaviour.

## Definition of done

The system is ready only when:

1. All Phase 1 portals and workflows are functional using persistent data.
2. Role, tenant, site, station, department and ownership restrictions are enforced and tested.
3. A visitor cannot be checked in without the configured approvals and validations.
4. Duplicate active visits, badge assignments and invalid passes are blocked.
5. Live occupancy matches entry/exit events and supports emergency roll call.
6. Visitor, vehicle, approval, incident and badge histories are auditable.
7. Reports and exports enforce data scope and masking.
8. Retention, legal hold and authorised privacy workflows are implemented.
9. Automated tests, linting/type checking and the production build pass.
10. No unresolved critical security or data-integrity defect remains.
11. Setup, deployment, administration and testing documentation is complete.

## Start now

Begin by reading the two scope files and inspecting the repository. Produce the implementation plan and gap assessment, then proceed with the foundation and the first complete vertical slice:

**authenticated Guard/Reception user → scoped station dashboard → register visitor → request/record approval → issue pass → check in → display in live occupancy → check out → audit the full journey.**

Preserve the existing template's visual quality throughout the implementation.
