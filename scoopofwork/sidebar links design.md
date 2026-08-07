The system should use one application with role-based portals and dynamic sidebars. Users only see links permitted by their assigned role, organisation, site, station and department.

## 1. Platform Administrator Portal

Purpose: Manage the entire multi-organisation platform.

| Sidebar link          | Function                                                           |
| --------------------- | ------------------------------------------------------------------ |
| Dashboard             | View organisations, active users, visits, system usage and alerts. |
| Organisations         | Create, activate, suspend and manage client organisations.         |
| Plans & Subscriptions | Manage service plans, limits and subscription status.              |
| Platform Users        | Manage platform administrators and support users.                  |
| System Health         | Monitor API, database, notifications, jobs and integrations.       |
| Integrations          | Configure global SMS, email and other service providers.           |
| Support Access        | Request temporary, audited access to an organisation.              |
| Global Audit Logs     | Review platform-level security and administrative actions.         |
| System Settings       | Manage global security and application configuration.              |

Recommended route: `/platform/*`

---

## 2. Organisation and Site Administration Portal

Purpose: Configure the organisation, branches, users and access policies.

| Sidebar link        | Function                                                       |
| ------------------- | -------------------------------------------------------------- |
| Dashboard           | Organisation-wide statistics and configuration alerts.         |
| Sites & Branches    | Create and manage offices, facilities and branches.            |
| Buildings & Zones   | Define public, staff-only, restricted and high-security zones. |
| Stations & Gates    | Configure receptions, entry gates and exit points.             |
| Departments         | Manage departments and departmental approvers.                 |
| Employees & Hosts   | Manage employees who may receive visitors.                     |
| Users               | Create, activate, suspend and assign staff accounts.           |
| Roles & Permissions | Configure roles and permission assignments.                    |
| Visitor Categories  | Configure guest, contractor, supplier, VIP and delivery types. |
| Approval Workflows  | Configure host, department and security approval rules.        |
| Badge Inventory     | Manage available, issued, lost, damaged and blocked badges.    |
| Notifications       | Configure email, SMS and in-app notification templates.        |
| Reports             | View authorised organisation and site reports.                 |
| Privacy & Retention | Configure notices, retention periods and legal holds.          |
| Integrations        | Configure HR, calendar, SMS, email and hardware integrations.  |
| Audit Logs          | Review administrative and security actions.                    |
| Settings            | Organisation branding, timezone and operational settings.      |

Recommended route: `/admin/*`

---

## 3. Security Management Portal

Purpose: Supervise physical access operations and security exceptions.

| Sidebar link         | Function                                                    |
| -------------------- | ----------------------------------------------------------- |
| Operations Dashboard | View live visitors, vehicles, pending approvals and alerts. |
| Live Occupancy       | See everyone currently inside each site and zone.           |
| Approval Queue       | Review visits requiring security approval.                  |
| Exceptions           | Manage expired visits, denied access and override requests. |
| Visitors             | Search and review authorised visitor records.               |
| Vehicles             | Monitor vehicle entry, exit and parking information.        |
| Contractors          | Review contractor approvals and required documents.         |
| Watchlist            | Manage restricted visitors and vehicles.                    |
| Badge Management     | Issue, block, replace and reconcile badges.                 |
| Incidents            | Record, assign, investigate and close security incidents.   |
| Overdue Visits       | Monitor visitors who have exceeded their approved duration. |
| Emergency Roll Call  | Start and manage evacuation attendance checks.              |
| Stations & Shifts    | Monitor guard stations and shift activity.                  |
| Security Reports     | Generate denied-entry, incident and occupancy reports.      |
| Activity Audit       | Review actions performed by security personnel.             |

Recommended route: `/security/*`

---

## 4. Guard and Reception Portal

Purpose: Handle daily visitor and vehicle processing.

| Sidebar link      | Function                                                       |
| ----------------- | -------------------------------------------------------------- |
| Dashboard         | View today’s visitors, vehicles, current occupancy and alerts. |
| New Visitor       | Register a walk-in visitor.                                    |
| New Vehicle       | Register a vehicle and its occupants.                          |
| Expected Arrivals | View approved and pre-registered visitors.                     |
| Pending Approvals | Track visitors waiting for host or security approval.          |
| Check-in          | Verify approval, issue a badge and record entry.               |
| Check-out         | Record exit and confirm badge return.                          |
| Visitor Logs      | Search visitor activity by date, name, host or status.         |
| Vehicle Logs      | Search vehicle entries and exits.                              |
| Deliveries        | Register couriers, parcels and handovers.                      |
| Badge Desk        | View available, issued, lost and unreturned badges.            |
| Overdue Visitors  | View visitors who should have left.                            |
| Report Incident   | Submit an incident or access exception.                        |
| Current Occupancy | View people presently inside the assigned site.                |
| Emergency List    | Open the restricted emergency roll-call view.                  |
| My Activity       | View actions performed during the user’s shift.                |
| More              | Profile, station selection, notifications, help and logout.    |

Recommended route: `/station/*`

The mobile bottom navigation can remain:

* Dashboard
* Visitors
* Quick Add
* Notifications
* More

---

## 5. Employee and Host Portal

Purpose: Allow employees to invite, approve and monitor their visitors.

| Sidebar link      | Function                                                      |
| ----------------- | ------------------------------------------------------------- |
| Dashboard         | View expected, pending and currently visiting guests.         |
| Invite Visitor    | Create and send a visitor invitation.                         |
| My Visitors       | View upcoming and historical visits addressed to the host.    |
| Approval Requests | Approve or reject walk-in and scheduled visitors.             |
| Visitors On-site  | View the host’s visitors currently inside.                    |
| Recurring Visits  | Manage approved recurring or multi-day visits.                |
| Group Visits      | Register meetings, events or multiple visitors.               |
| My Delegates      | Assign a temporary departmental or host delegate.             |
| Notifications     | View visitor arrival, rejection and overdue alerts.           |
| My Profile        | Contact information, department and notification preferences. |

Recommended route: `/host/*`

---

## 6. Management Portal

Purpose: Provide management with read-only operational intelligence.

| Sidebar link              | Function                                                          |
| ------------------------- | ----------------------------------------------------------------- |
| Executive Dashboard       | Organisation-wide visitor and security indicators.                |
| Live Occupancy            | View current occupancy by site without unnecessary personal data. |
| Visitor Analytics         | Visitor trends, purposes and peak periods.                        |
| Vehicle Analytics         | Vehicle traffic and parking trends.                               |
| Site Comparison           | Compare activity across branches and facilities.                  |
| Host & Department Reports | Analyse visitor volumes by department or host.                    |
| Exceptions Summary        | View overdue, rejected and denied visits.                         |
| Incident Summary          | View incident statistics and status.                              |
| Reports                   | Generate authorised management reports.                           |
| Scheduled Reports         | Configure recurring reports for approved recipients.              |
| Export History            | View management report exports.                                   |

Recommended route: `/management/*`

---

## 7. Audit and Compliance Portal

Purpose: Review controls, privacy compliance and audit evidence.

| Sidebar link             | Function                                                    |
| ------------------------ | ----------------------------------------------------------- |
| Compliance Dashboard     | View access reviews, privacy requests and audit alerts.     |
| Audit Trail              | Search immutable system and user activity records.          |
| User Access Review       | Review users, roles, scopes and last activity.              |
| Privileged Access        | Review administrators and temporary support access.         |
| Approval & Override Logs | Review approvals, rejections and security exceptions.       |
| Export Logs              | Review who exported information, why and what was included. |
| Privacy Requests         | Track access, correction, restriction and erasure requests. |
| Retention & Legal Holds  | Review retention processing and protected records.          |
| Incident Review          | View authorised incident and breach-response records.       |
| Data Processing Register | Document processing purposes and data categories.           |
| Compliance Reports       | Generate audit and regulatory reports.                      |
| Evidence Export          | Produce authorised evidence packages for investigations.    |

Recommended route: `/compliance/*`

---

## 8. Emergency Operations Portal

Purpose: Provide a restricted, simplified interface during emergencies.

| Sidebar link        | Function                                                          |
| ------------------- | ----------------------------------------------------------------- |
| Emergency Dashboard | View active emergencies and total people on-site.                 |
| Current Occupancy   | Display visitors currently inside each site.                      |
| Start Roll Call     | Create a new evacuation attendance event.                         |
| Roll Call           | Mark visitors as accounted for, left site, unknown or unresolved. |
| Zone View           | View the last recorded zones of visitors.                         |
| Unresolved Persons  | Display visitors not yet accounted for.                           |
| Emergency Contacts  | View authorised host and emergency contact details.               |
| Previous Events     | Review completed emergency roll calls.                            |
| Print/Export        | Produce an emergency occupancy list.                              |

Recommended route: `/emergency/*`

---

## 9. Visitor Self-Service and Kiosk Portal

Purpose: Allow visitors to pre-register or complete reception check-in.

This portal should use a guided process instead of a full sidebar:

1. Scan invitation QR code or enter reference.
2. Confirm visit and host.
3. Enter or verify visitor details.
4. Read the privacy notice and safety instructions.
5. Capture authorised photo or signature where required.
6. Submit check-in request.
7. Wait for approval where necessary.
8. Receive or print the visitor pass.
9. Check out using the QR code or badge.

Recommended routes:

* `/visit/invite/:token`
* `/kiosk/check-in`
* `/kiosk/check-out`

The kiosk must automatically return to its welcome screen after every visitor and must never display the previous visitor’s information.

## Recommended portal structure

| Portal                | Primary users                             |
| --------------------- | ----------------------------------------- |
| Platform Portal       | Platform administrators                   |
| Administration Portal | Organisation and site administrators      |
| Security Portal       | Security managers and supervisors         |
| Station Portal        | Guards and receptionists                  |
| Host Portal           | Employees and departmental approvers      |
| Management Portal     | Executives and authorised managers        |
| Compliance Portal     | Auditors, compliance and privacy officers |
| Emergency Portal      | Emergency and security officers           |
| Visitor/Kiosk Portal  | Visitors and self-service users           |
