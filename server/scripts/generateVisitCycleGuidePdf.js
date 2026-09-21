/**
 * Staff / operator guide for the visit-cycle closure work (Sep 2026).
 * Run: node server/scripts/generateVisitCycleGuidePdf.js
 */
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { APP_NAME, APP_TAGLINE } from '../../shared/branding.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', '..', 'docs', 'visit-cycle-closure-guide.pdf');

const BRAND = {
  navy950: '#0A1929',
  navy900: '#102A43',
  navy700: '#334E68',
  navy100: '#D9E2EC',
  cyan600: '#14919B',
  cyan500: '#2CB1BC',
  coral: '#E87722',
  gold: '#F5B041',
  white: '#FFFFFF',
  paper: '#F8FAFC',
};

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function drawLogoMark(doc, x, y, size = 40) {
  doc.save();
  doc.roundedRect(x, y, size, size, 8).fill(BRAND.navy950);
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size * 0.34;
  doc.circle(cx, cy, r).lineWidth(2).strokeColor(BRAND.coral).stroke();
  doc.circle(cx, cy, r * 0.55).lineWidth(1.5).strokeColor(BRAND.gold).stroke();
  doc.restore();
}

function drawHeader(doc, margin, title) {
  const W = doc.page.width;
  const barH = 72;
  doc.save();
  doc.rect(0, 0, W, barH).fill(BRAND.navy900);
  doc.rect(0, barH - 4, W, 4).fill(BRAND.cyan600);
  drawLogoMark(doc, margin, 16, 40);
  doc.fillColor(BRAND.white).font('Helvetica-Bold').fontSize(16);
  doc.text(title, margin + 52, 20);
  doc.font('Helvetica').fontSize(9).fillColor(BRAND.navy100);
  doc.text(`${APP_NAME}  ·  21 September 2026`, margin + 52, 44, { width: W - margin * 2 - 52 });
  doc.restore();
  return barH + 18;
}

function drawFooter(doc, margin) {
  const y = doc.page.height - 36;
  doc.save();
  doc.moveTo(margin, y - 8).lineTo(doc.page.width - margin, y - 8)
    .lineWidth(0.5).strokeColor(BRAND.navy100).stroke();
  doc.fillColor(BRAND.navy700).font('Helvetica').fontSize(7.5);
  doc.text(
    `${APP_NAME}  ·  Visit cycle closure guide  ·  Page ${doc.page.pageNumber}`,
    margin,
    y,
    { width: doc.page.width - margin * 2, align: 'center' },
  );
  doc.restore();
}

function sectionTitle(doc, x, y, title) {
  doc.save();
  doc.fillColor(BRAND.navy900).font('Helvetica-Bold').fontSize(12);
  doc.text(title, x, y);
  doc.moveTo(x, y + 16).lineTo(x + 160, y + 16).lineWidth(2).strokeColor(BRAND.cyan600).stroke();
  doc.restore();
  return y + 26;
}

function body(doc, x, y, text, width) {
  doc.fillColor(BRAND.navy700).font('Helvetica').fontSize(9.5);
  doc.text(text, x, y, { width, align: 'left', lineGap: 2 });
  return y + doc.heightOfString(text, { width, lineGap: 2 }) + 10;
}

function bullets(doc, x, y, items, width) {
  items.forEach((line) => {
    const h = doc.heightOfString(line, { width: width - 14, lineGap: 1 });
    if (y + h > doc.page.height - 56) {
      drawFooter(doc, 48);
      doc.addPage();
      y = 48;
    }
    doc.circle(x + 4, y + 5, 2).fill(BRAND.cyan600);
    doc.fillColor(BRAND.navy700).font('Helvetica').fontSize(9.5);
    doc.text(line, x + 14, y, { width: width - 14, lineGap: 1 });
    y += h + 7;
  });
  return y + 4;
}

function roleBox(doc, x, y, w, h, title, lines) {
  doc.save();
  doc.roundedRect(x, y, w, h, 8).fillAndStroke(BRAND.paper, BRAND.navy100);
  doc.fillColor(BRAND.navy900).font('Helvetica-Bold').fontSize(10);
  doc.text(title, x + 10, y + 10, { width: w - 20 });
  doc.fillColor(BRAND.navy700).font('Helvetica').fontSize(8);
  doc.text(lines.join('\n'), x + 10, y + 26, { width: w - 20, lineGap: 2 });
  doc.restore();
}

function generate() {
  ensureDir(OUT);
  const margin = 48;
  const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 0, autoFirstPage: true });
  const stream = fs.createWriteStream(OUT);
  doc.pipe(stream);
  const W = doc.page.width - margin * 2;

  let y = drawHeader(doc, margin, 'Visit Cycle Closure Guide');
  doc.fillColor(BRAND.navy700).font('Helvetica').fontSize(10);
  doc.text(APP_TAGLINE, margin, y, { width: W, align: 'center' });
  y += 22;
  y = body(
    doc,
    margin,
    y,
    'This guide records the work done to close incomplete visit cycles and fix the desk/gate UX holes that left visits stuck. Use it as a walkthrough for hosts, reception, and gate staff after deploy.',
    W,
  );

  y = sectionTitle(doc, margin, y, 'What was broken');
  y = bullets(doc, margin, y, [
    'Hosts could invite a visitor but had no way to cancel a booking from the app.',
    'Expected / approved visits that never arrived stayed open forever (no no-show / expire).',
    'Reception checkout stopped at checked_out. Without a gate confirm, the visit never reached completed.',
    'A new gate vehicle visit was stored as expected while the vehicle was already on_site — occupancy and visit status disagreed.',
    'Gate / desk check-in and the station New Visitor form could submit with no host.',
    'Station visit detail was read-only, overdue visits hid reception actions, kiosk success left pass codes on screen, and checkout fired with one tap.',
    'Invite Visitor existed as a page but was missing from the host sidebar.',
    'The transition graph included a fake status named queue that is not a real visit status.',
  ], W);

  y = sectionTitle(doc, margin, y, 'Happy path now');
  y = body(
    doc,
    margin,
    y,
    'Host invite → expected or pending_approval → (optional) arrived_at_gate → reception_check_in → waiting → in_meeting → checked_out → left_premises → completed.',
    W,
  );
  y = bullets(doc, margin, y, [
    'Reception-only visits (never logged at a gate) complete at desk checkout: checked_out then left_premises then completed in one action.',
    'Visits that arrived at a gate stay at checked_out until gate or reception taps Confirm left.',
    'Past expected / approved bookings with a passed appointment window are marked expired by a background worker.',
    'Pre-arrival bookings can be cancelled by the host or reception with a confirmation dialog.',
  ], W);

  y = sectionTitle(doc, margin, y, 'What each role can do now');
  const colW = (W - 12) / 2;
  const boxH = 118;
  if (y + boxH * 2 + 20 > doc.page.height - 56) {
    drawFooter(doc, margin);
    doc.addPage();
    y = 48;
  }
  roleBox(doc, margin, y, colW, boxH, 'Host', [
    '• Invite Visitor is in the sidebar.',
    '• Cancel a booking from visit detail or appointments (confirm dialog).',
    '• Approve / reject reception requests as before.',
    '• On-site list stays read-only — exit is still desk or gate.',
  ]);
  roleBox(doc, margin + colW + 12, y, colW, boxH, 'Reception', [
    '• Cancel expected bookings from logs or detail.',
    '• Checkout asks to confirm badge return.',
    '• Desk-only visits complete on checkout.',
    '• Confirm left closes leftover checked_out rows.',
    '• Overdue visits show Check out as the action.',
  ]);
  y += boxH + 12;
  roleBox(doc, margin, y, colW, boxH, 'Gate / station', [
    '• Host is required on walk-in, vehicle, and New Visitor.',
    '• New vehicle visits start as arrived_at_gate.',
    '• Visit detail now has check-in, check-out, confirm left.',
    '• Checkout / confirm left use a confirmation dialog.',
  ]);
  roleBox(doc, margin + colW + 12, y, colW, boxH, 'Kiosk visitor', [
    '• Check-in / check-out success screens clear after 8 seconds.',
    '• Pass code and badge are not left for the next person.',
    '• Footer copy now matches that behaviour.',
  ]);
  y += boxH + 18;

  drawFooter(doc, margin);
  doc.addPage();
  y = drawHeader(doc, margin, 'How to walk the cycle');

  y = sectionTitle(doc, margin, y, 'Demo accounts');
  y = bullets(doc, margin, y, [
    'Password for all @demo.org users: demo1234. Super admin: admin@template.dev / admin123.',
    'host@demo.org — Host calendar, invite, approvals, visitor logs.',
    'reception@demo.org — Reception calendar, check-in desk, visitor logs. Needs a linked receptionist profile.',
    'gate@demo.org — Station dashboard, gate check-in / checkout, visitor logs.',
    'Kiosk: open /kiosk (no staff login).',
  ], W);

  y = sectionTitle(doc, margin, y, 'Suggested walkthrough');
  y = bullets(doc, margin, y, [
    'Host: Invite Visitor → confirm it appears on Appointments / Visitor Logs → Cancel one booking and confirm the dialog.',
    'Host: leave a second invite active so reception can receive it.',
    'Reception: Expected tab or Visitor Logs → Check in / Receive at desk → Queue to host → Check out (confirm badge) → visit should show Completed if it never hit the gate.',
    'Reception: overdue rows now offer Check out. Leftover checked_out rows offer Confirm left.',
    'Gate: Expected arrivals → check in a guest (host required) → open the visit from logs and check out or confirm left.',
    'Gate: Vehicle entry creates the visit as arrived_at_gate so it appears on occupancy and the exit list.',
    'Kiosk: check in, then wait ~8 seconds — the pass code screen must return to /kiosk by itself.',
  ], W);

  y = sectionTitle(doc, margin, y, 'Status meanings after this change');
  y = bullets(doc, margin, y, [
    'cancelled — host or reception closed a pre-arrival booking. Terminal.',
    'expired — appointment window passed and the guest never checked in. Set by the expire worker. Terminal.',
    'checked_out — left the desk. If they came through a gate, wait for Confirm left. If they did not, the system completes the visit immediately.',
    'left_premises / completed — physically off site. Occupancy and host availability are cleared.',
    'overdue — still on site past the category duration. Reception primary action is now Check out.',
    'denied is still unused. Watchlist blocks do not create a visit record yet.',
  ], W);

  y = sectionTitle(doc, margin, y, 'Technical notes for engineers');
  y = bullets(doc, margin, y, [
    'Cancel: applyVisitCancel() in server/visitCancel.js. Host POST /admin/host/visits/:id/cancel. Reception POST /admin/reception/visits/:id/cancel. Shared helper isCancelEligible() in shared/visitCancel.js.',
    'Expire: markExpiredVisits() in server/visitExpire.js, scheduled from server/index.js (EXPIRED_VISIT_INTERVAL_MS, default 60s). Only approved / expected with a past expected_at or appointment.scheduled_at and no checked_in_at.',
    'Reception finalize: shouldFinalizeReceptionCheckout() looks for arrived_at_gate / entered_premises events. If none, checkout calls finalizeVisitDeparture().',
    'Gate vehicle insert status is arrived_at_gate (server/routes/visitor.js). Linked expected visits still transition when allowed.',
    'VISIT_TRANSITIONS no longer includes the invalid queue token. expected and entered_premises now list waiting / pending_approval (and expected can cancel).',
    'Tests: tests/visitExpire.test.js, tests/visitExit.test.js, tests/reception.test.js, tests/scope.test.js, tests/portalLock.test.js.',
  ], W);

  y = sectionTitle(doc, margin, y, 'Out of scope this pass');
  y = bullets(doc, margin, y, [
    'Watchlist “denied entry” visit records and the unused denied status.',
    'entered_premises as a separate gate UI step.',
    'Design.md extras: badge reconcile, deliveries, emergency zone view, mobile bottom nav.',
    'Pagination / silent empty-list toasts on visitor logs.',
  ], W);

  y = sectionTitle(doc, margin, y, 'How to run locally');
  y = bullets(doc, margin, y, [
    'cp .env.example .env   then npm install.',
    'Create MySQL database wgvl. If another app already uses port 4000, start this API with PORT=4001.',
    'npm run server:start    and    npm run dev.',
    'Optional: npm run seed:portal-users.',
    'Regenerate this PDF: node server/scripts/generateVisitCycleGuidePdf.js.',
  ], W);

  drawFooter(doc, margin);
  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(OUT));
    stream.on('error', reject);
  });
}

generate()
  .then((file) => {
    console.log(`Wrote ${file}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
