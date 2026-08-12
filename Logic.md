You are working on an existing Visitor Log and Access Control System. Do not rebuild the system or replace the current architecture. Inspect the existing codebase, authentication, database structure, remote database integration, roles, zones, sites, buildings, gates, appointment/check-in workflows, expected visitor pages, and notification services before implementing this enhancement.

## Objective

Implement secure, zone-based and location-based visitor data access between:

* Hosts working from offices
* Receptionists working from reception areas
* Security officers working at gates
* Sites, buildings, gates, and reception zones

The main goal is to protect sensitive visitor information while ensuring that each user sees the information required to perform their duties.

## Existing Remote Database Information

The remote database contains host roles such as:

* CEO
* DEPUTY CEO
* GENERAL EMPLOYEE

These roles are linked to users who operate as Hosts.

The remote database also contains reception zones such as:

* CEO - Reception
* DCEO - Reception
* Reception Area

These zones connect Hosts to the appropriate Receptionists.

Use the actual remote database IDs and relationships wherever they exist. Do not depend only on zone names or hard-code names throughout the application.

If the database does not already contain direct role-to-zone relationships, introduce a configurable mapping such as:

* CEO → CEO - Reception
* DEPUTY CEO → DCEO - Reception
* GENERAL EMPLOYEE → Reception Area

This mapping must be configurable and must not be scattered as hard-coded conditions across controllers or UI components.

The remote database should remain the authoritative source. Do not modify its schema unless the project already supports and requires remote database migrations.

## Core Access Rule

When a Host creates an appointment or expected visitor check-in, determine access using the Host’s zone and the Receptionist’s assigned zone.

A Receptionist has full visitor access only when the Receptionist and Host share at least one active zone.

Use zone IDs for comparisons:

```text
sameZone = intersection(host.zoneIds, receptionist.zoneIds).length > 0
```

Role names must not grant full visitor information by themselves. The actual zone relationship must determine full access.

If a Host has no valid zone assignment, fail safely:

* Do not expose full visitor information.
* Show only the restricted visitor summary.
* Record a configuration warning for administrators.
* Never expose sensitive data merely because a zone assignment is missing.

## Receptionist Access Rules

### Receptionist in the Same Zone as the Host

When the Receptionist shares a zone with the Host:

* Send an in-app notification.
* Send an email notification.
* Send an SMS notification.
* Add the visitor under Expected Visitors.
* Allow the Receptionist to open the expected visitor record.
* Allow access to the full visitor information permitted by the current visitor model.

Full information can include:

* Full visitor name
* Profile photo, where available
* Identification information, subject to the existing ID-handling policy
* Phone number
* Email address
* Residential or contact address, where available
* Company name
* Job title or position
* Company contact details
* Appointment date and time
* Host information
* Visit purpose
* Assigned site, building, reception, and gate
* Vehicle details, where applicable
* Check-in status
* Other operational visitor information already supported by the system

Do not expose private Host notes, security notes, internal risk findings, or administrative metadata unless the existing permission policy explicitly allows the Receptionist to access them.

### Receptionist in a Different Zone

A Receptionist who does not share a zone with the Host may receive a general expected-visitor notification, but the notification and Expected Visitors page must reveal only:

* Visitor name
* Expected visit date and time

The system must not expose:

* Phone number
* Email address
* Physical address
* Identification number
* Company name
* Job title
* Company contact information
* Visit purpose
* Documents or attachments
* Host’s private notes
* Vehicle details
* Custom visitor fields
* Raw API or database metadata
* Any other personal or company information

An opaque visit ID may be returned by the API only where technically required, but it must not reveal meaningful visitor information.

If the restricted Receptionist opens the visitor record, either show a restricted summary containing only the name and visit time or return a clear authorization response. Never return the full record and merely hide it using CSS or frontend conditions.

## Important Notification Privacy Rules

Notification content must follow the recipient’s access level before the message is created.

### Same-zone Receptionist

* In-app notification can show visitor name, appointment time, company, and Host, with a secure link to the full record.
* Email should contain only the operational information required and a secure authenticated link.
* SMS should remain short and privacy-conscious, preferably visitor name, time, and a secure instruction to check the application.
* Do not place raw ID numbers, addresses, documents, private notes, or excessive personal data in email or SMS.

### Different-zone Receptionist

All channels must contain only:

* Visitor name
* Expected date and time

Do not generate a full notification and later attempt to mask it. Build the correct payload for each recipient before sending it.

Notification recipients should be active Receptionists assigned to the relevant site or building. Split them into same-zone and different-zone recipient groups before building notifications.

## Security Officer Access

Security access must be determined by assigned:

* Site
* Building
* Gate

A Security Officer should only see expected visitors assigned to the site, building, or gate where that officer is currently authorized to operate.

Security may see only the operational information required at the gate, such as:

* Visitor name
* Expected time
* Host name
* Destination building or office
* Assigned gate
* Check-in status
* Vehicle registration, where required
* Identity verification status

Do not expose visitor phone numbers, email addresses, company details, residential addresses, raw identification numbers, attachments, or private notes unless a separate explicit permission already authorizes it.

Security Officers assigned to a different site, building, or gate must not see the visit.

## Host Access

Hosts must be able to see the complete information for visitors attached to appointments they created or own.

A Host role such as CEO or DEPUTY CEO must not automatically allow the Host to view every visitor in the system. Ownership, delegated access, or an existing administrative permission must still be verified.

## Backend Authorization

This feature must be enforced on the backend. Frontend hiding alone is unacceptable.

Create a centralized authorization policy or service that evaluates:

* Authenticated user
* User type or role
* Host ownership
* Receptionist zone membership
* Appointment/Host zone
* Security site, building, and gate assignments
* Existing administrative permissions
* Record status, where relevant

Do not trust role IDs, user IDs, zone IDs, site IDs, building IDs, or gate IDs supplied by the browser. Resolve authorization from the authenticated session and trusted database relationships.

Use deny-by-default authorization.

Create explicit response serializers or DTOs, for example:

* `FullExpectedVisitorDTO`
* `RestrictedExpectedVisitorDTO`
* `SecurityExpectedVisitorDTO`

The restricted DTO must be based on an allowlist. Do not create it by returning the full visitor object and removing a few known properties.

Apply the same authorization rules to:

* Expected visitor lists
* Visitor detail endpoints
* Search results
* Dashboard widgets
* Calendar views
* Reports
* Exports
* Print views
* WebSocket events
* In-app notifications
* Email notifications
* SMS notifications
* Mobile API endpoints
* File and document downloads

Prevent hidden information from leaking through query strings, browser state, cached API responses, HTML source, frontend logs, exception messages, or notification payloads.

## Appointment Creation Flow

When a Host creates an appointment/check-in:

1. Validate the Host, visitor, date, time, site, building, gate, and zone.
2. Save the expected visit.
3. Resolve active Receptionists assigned to the relevant site/building.
4. Compare each Receptionist’s zone assignments with the Host’s zone assignments.
5. Send detailed notifications to same-zone Receptionists.
6. Send restricted notifications to different-zone Receptionists.
7. Make the visit available to Security only at the assigned site/building/gate.
8. Record notification delivery attempts without recording unnecessary visitor PII.
9. Prevent duplicate notifications using the project’s existing queue, event, or outbox mechanism.
10. Retry failed email or SMS notifications safely without creating duplicates.

## Data Protection Requirements

Classify sensitive data and protect it using least-privilege access.

Ensure that:

* Connections use HTTPS/TLS.
* Sensitive fields use the application’s existing encryption mechanism where appropriate.
* Passwords and secrets are never logged.
* Remote database credentials are not exposed.
* Visitor ID numbers and documents are not included in logs.
* Cached visitor data respects the same access policy.
* Cache keys account for the authenticated user’s access level.
* Sessions expire according to the existing security configuration.
* Exports and downloads require fresh authorization.
* Signed document URLs are short-lived.
* Access to full visitor records is auditable.
* Revoked zone, site, building, or gate assignments take effect immediately or after the shortest safe cache period.

Add audit records for:

* Full visitor record viewed
* Visitor record exported
* Visitor document downloaded
* Visitor details updated
* Check-in performed
* Check-out performed
* Access denied because of zone or location mismatch

Audit logs should store the acting user, visit reference, action, timestamp, and access decision without unnecessarily duplicating sensitive personal information.

## User Interface Requirements

Update the Expected Visitors interface so that:

* Same-zone Receptionists see the existing detailed visitor card/table.
* Different-zone Receptionists see only visitor name and visit time.
* Restricted rows do not contain contact buttons, company information, documents, tooltips, hidden fields, or detail actions that expose more information.
* Security sees a gate-focused operational view.
* Unauthorized fields are not downloaded to the browser.
* Loading, empty, error, and access-restricted states are handled clearly.
* The design remains consistent with the current system.

Do not display confusing messages such as “data unavailable” for intentionally protected information. Simply omit the protected fields or show a small “Restricted by zone” indicator where useful.

## Required Test Scenarios

Add unit, integration, authorization, API, notification, and UI tests covering at least:

1. CEO Host and Receptionist both assigned to `CEO - Reception`:

   * Receptionist receives in-app, email, and SMS notifications.
   * Receptionist sees full allowed visitor information.

2. CEO Host and Receptionist assigned to `DCEO - Reception`:

   * Receptionist receives only the restricted notification.
   * Expected Visitors shows only visitor name and time.
   * Direct API requests do not return sensitive fields.

3. DEPUTY CEO Host and Receptionist assigned to `DCEO - Reception`:

   * Full permitted information is available.

4. GENERAL EMPLOYEE Host and Receptionist assigned to `Reception Area`:

   * Full permitted information is available.

5. Receptionist with multiple zones:

   * Full access is granted when at least one zone matches.

6. Host without a zone:

   * No full visitor information is exposed.
   * A configuration warning is logged safely.

7. Receptionist whose zone has been removed:

   * Full access is immediately revoked.
   * Previously accessible cached responses cannot expose the information.

8. Security Officer assigned to the correct gate:

   * Gate operational information is visible.

9. Security Officer assigned to another site, building, or gate:

   * The visit is not visible.

10. Host attempts to access another Host’s visitor:

    * Access is denied unless an existing delegated or administrative permission applies.

11. Restricted Receptionist manually calls the detail, export, print, search, or document endpoints:

    * Sensitive information is not returned.

12. Notification retry:

    * Failed messages can be retried without duplicate notifications.

13. Cross-tenant or cross-company access, if the system is multi-tenant:

    * Access is completely denied.

## Implementation Instructions

Before changing code:

1. Inspect the current repository structure.
2. Identify the authentication and authorization approach.
3. Identify models and tables for users, roles, hosts, receptionists, security officers, zones, sites, buildings, gates, visitors, appointments, and notifications.
4. Inspect how remote database records are synchronized or queried.
5. Identify every endpoint and UI component that returns expected visitor information.
6. Identify all notification channels and background queues.
7. Document the current data flow and the exact files that need modification.

Then implement the enhancement using the project’s existing patterns and naming conventions.

Do not create duplicate authorization logic in multiple controllers. Build a reusable centralized policy/service and reusable response serializers.

Do not remove or overwrite unrelated functionality. Preserve existing migrations, data, user changes, and notification behavior that does not conflict with these requirements.

After implementation:

* Run all relevant tests.
* Run linting and type checking where available.
* Run the production build.
* Report any existing unrelated failures separately.
* Provide a concise summary of the authorization rules implemented.
* List all changed files.
* List migrations or configuration changes.
* Explain how the remote database role and zone relationships were resolved.
* Provide the final access-control matrix.
* Provide test results and any remaining risks.

Do not claim completion until backend authorization, frontend behavior, notifications, and tests all enforce the same policy.
