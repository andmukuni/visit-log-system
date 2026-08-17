/**
 * Branded portrait visit lifecycle illustration PDF.
 * Run: node server/scripts/generateVisitLifecyclePdf.js
 */
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { APP_NAME, APP_TAGLINE } from '../../shared/branding.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', '..', 'docs', 'visit-lifecycle.pdf');

/** Matches src/index.css + favicon.svg */
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

const STAGE = {
  booking: '#DBEAFE',
  gate: '#CFFAFE',
  reception: '#CCFBF1',
  host: '#EDE9FE',
  exit: '#E2E8F0',
  branch: '#FEF3C7',
  alert: '#FFEDD5',
  end: '#FEE2E2',
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
  doc.circle(cx, cy, r * 0.55)
    .lineWidth(1.5)
    .strokeColor(BRAND.gold)
    .stroke();
  doc.restore();
}

function drawHeader(doc, margin) {
  const W = doc.page.width;
  const barH = 72;
  doc.save();
  doc.rect(0, 0, W, barH).fill(BRAND.navy900);
  doc.rect(0, barH - 4, W, 4).fill(BRAND.cyan600);
  drawLogoMark(doc, margin, 16, 40);
  doc.fillColor(BRAND.white).font('Helvetica-Bold').fontSize(18);
  doc.text('Visit Lifecycle', margin + 52, 22);
  doc.font('Helvetica').fontSize(9).fillColor(BRAND.navy100);
  doc.text(APP_NAME, margin + 52, 44, { width: W - margin * 2 - 52 });
  doc.restore();
  return barH + 20;
}

function sectionTitle(doc, x, y, title) {
  doc.save();
  doc.fillColor(BRAND.navy900).font('Helvetica-Bold').fontSize(11);
  doc.text(title, x, y);
  doc.moveTo(x, y + 14).lineTo(x + 120, y + 14).lineWidth(2).strokeColor(BRAND.cyan600).stroke();
  doc.restore();
  return y + 22;
}

function flowBox(doc, x, y, w, h, fill, label, sub) {
  doc.save();
  doc.roundedRect(x, y, w, h, 8).fillAndStroke(fill, BRAND.navy700);
  doc.fillColor(BRAND.navy900).font('Helvetica-Bold').fontSize(10);
  doc.text(label, x + 10, y + 10, { width: w - 20, align: 'center' });
  if (sub) {
    doc.fillColor(BRAND.navy700).font('Helvetica').fontSize(7.5);
    doc.text(sub, x + 10, y + 24, { width: w - 20, align: 'center' });
  }
  doc.restore();
}

function downArrow(doc, cx, y1, y2) {
  doc.save();
  doc.strokeColor(BRAND.navy700).lineWidth(1.4);
  doc.moveTo(cx, y1).lineTo(cx, y2 - 6).stroke();
  doc.moveTo(cx, y2)
    .lineTo(cx - 5, y2 - 8)
    .lineTo(cx + 5, y2 - 8)
    .closePath()
    .fill(BRAND.navy700);
  doc.restore();
}


function drawFooter(doc, margin) {
  const y = doc.page.height - 40;
  doc.save();
  doc.moveTo(margin, y - 8).lineTo(doc.page.width - margin, y - 8)
    .lineWidth(0.5)
    .strokeColor(BRAND.navy100)
    .stroke();
  doc.fillColor(BRAND.navy700).font('Helvetica').fontSize(7.5);
  doc.text(
    `${APP_NAME} · visitJourney.js + scopeService.js · ${new Date().toLocaleDateString('en-GB')}`,
    margin,
    y,
    { width: doc.page.width - margin * 2, align: 'center' },
  );
  doc.restore();
}

function drawHappyPath(doc, startY, margin) {
  const W = doc.page.width;
  const boxW = 168;
  const boxH = 38;
  const cx = W / 2;
  const x = cx - boxW / 2;
  let y = sectionTitle(doc, margin, startY, 'Happy path (top → bottom)');

  const steps = [
    { fill: STAGE.booking, label: 'Expected', sub: 'expected · approved · pre_registered' },
    { fill: STAGE.gate, label: 'At gate', sub: 'arrived_at_gate · entered_premises' },
    { fill: STAGE.reception, label: 'Reception / On site', sub: 'reception_check_in · checked_in' },
    { fill: STAGE.host, label: 'Host queue', sub: 'pending_approval (on site)*' },
    { fill: STAGE.host, label: 'Waiting for host', sub: 'waiting' },
    { fill: STAGE.host, label: 'With host', sub: 'in_meeting' },
    { fill: STAGE.exit, label: 'Checked out', sub: 'checked_out' },
    { fill: STAGE.exit, label: 'Left premises', sub: 'left_premises' },
    { fill: STAGE.exit, label: 'Completed', sub: 'completed' },
  ];

  steps.forEach((step, i) => {
    if (i > 0) downArrow(doc, cx, y - 6, y);
    flowBox(doc, x, y, boxW, boxH, step.fill, step.label, step.sub);
    y += boxH + 14;
  });

  doc.fillColor(BRAND.navy700).font('Helvetica-Oblique').fontSize(7.5);
  doc.text(
    '* Queued at reception: technical status pending_approval, UI label stays "On site".',
    margin,
    y + 4,
    { width: W - margin * 2, align: 'center' },
  );

  return y + 28;
}

function drawBranches(doc, startY, margin) {
  const W = doc.page.width;
  const colW = (W - margin * 2 - 12) / 2;
  let y = sectionTitle(doc, margin, startY, 'Branches & exceptions');

  const items = [
    { fill: STAGE.branch, label: 'Pre-arrival approve', sub: 'Host → expected / approved' },
    { fill: STAGE.branch, label: 'On-site approve', sub: 'Host → waiting' },
    { fill: STAGE.end, label: 'Host reject', sub: 'rejected (may re-queue if on site)' },
    { fill: STAGE.reception, label: 'Re-queue', sub: 'rejected + checked_in_at → host queue' },
    { fill: STAGE.alert, label: 'Overdue', sub: 'Auto when stay exceeds duration' },
    { fill: STAGE.end, label: 'Cancelled / expired', sub: 'Terminal — visit ended' },
  ];

  items.forEach((item, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const bx = margin + col * (colW + 12);
    const by = y + row * 50;
    flowBox(doc, bx, by, colW, 42, item.fill, item.label, item.sub);
  });

  return y + 3 * 50 + 8;
}

function drawActors(doc, startY, margin) {
  const W = doc.page.width;
  const colW = (W - margin * 2 - 12) / 2;
  let y = sectionTitle(doc, margin, startY, 'Who acts at each stage');

  const actors = [
    ['Gate / kiosk', 'Arrive · gate check-in · checkout · confirm left premises'],
    ['Reception', 'Receive at desk · queue to host · with host · checkout'],
    ['Host', 'Approve or reject (invite or on-site queue)'],
    ['System', 'Marks overdue (~60s worker) when duration exceeded'],
  ];

  actors.forEach(([title, desc], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    flowBox(doc, margin + col * (colW + 12), y + row * 48, colW, 40, BRAND.paper, title, desc);
  });

  return y + 2 * 48 + 12;
}

function drawRules(doc, startY, margin) {
  const W = doc.page.width;
  let y = sectionTitle(doc, margin, startY, 'Rules to remember');

  doc.fillColor(BRAND.navy900).font('Helvetica').fontSize(9);
  const bullets = [
    'On-site occupancy: desk/gate statuses OR (pending_approval / rejected WITH checked_in_at).',
    'Reception checkout → checked_out; guest may still appear at gate until left_premises is confirmed.',
    'Gate/kiosk checkout can complete departure in one step when configured.',
    'Pre-arrival pending_approval is NOT on-site occupancy until the visitor checks in.',
  ];

  bullets.forEach((line) => {
    doc.circle(margin + 4, y + 5, 2).fill(BRAND.cyan600);
    doc.text(line, margin + 14, y, { width: W - margin * 2 - 14 });
    y += doc.heightOfString(line, { width: W - margin * 2 - 14 }) + 8;
  });

  return y + 4;
}

function generate() {
  ensureDir(OUT);
  const margin = 48;
  const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 0, autoFirstPage: true });
  const stream = fs.createWriteStream(OUT);
  doc.pipe(stream);

  let y = drawHeader(doc, margin);
  doc.fillColor(BRAND.navy700).font('Helvetica').fontSize(10);
  doc.text(APP_TAGLINE, margin, y, { width: doc.page.width - margin * 2, align: 'center' });
  y += 28;

  y = drawHappyPath(doc, y, margin);

  if (y > doc.page.height - 320) {
    drawFooter(doc, margin);
    doc.addPage();
    y = margin;
    doc.fillColor(BRAND.navy900).font('Helvetica-Bold').fontSize(14);
    doc.text('Visit Lifecycle (continued)', margin, y);
    y += 28;
  }

  y = drawBranches(doc, y, margin);
  y = drawActors(doc, y, margin);
  y = drawRules(doc, y, margin);

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
