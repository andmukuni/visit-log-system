import express from 'express';
import pool from '../db.js';
import { generateId } from '../visitorSchema.js';
import { generateInviteToken } from '../platformSchema.js';
import { writeVisitEvent, writeAuditLog } from '../auditService.js';
import { canTransition } from '../scopeService.js';
import { findWatchlistMatches } from '../watchlistService.js';
import { notifyVisitEvent } from '../notificationService.js';

export function createKioskRouter() {
  const router = express.Router();

  async function resolveOrg(orgSlug) {
    const slug = String(orgSlug || process.env.KIOSK_ORG_SLUG || 'demo-org').trim();
    const [[org]] = await pool.query(`SELECT * FROM organisations WHERE slug = ? AND status = 'active' LIMIT 1`, [slug]);
    return org || null;
  }

  router.get('/config', async (req, res) => {
    try {
      const org = await resolveOrg(req.query.org);
      if (!org) return res.status(404).json({ ok: false, message: 'Organisation not found.' });

      const [sites] = await pool.query(
        `SELECT id, name, code FROM sites WHERE organisation_id = ? AND status = 'active' ORDER BY name ASC`,
        [org.id],
      );

      res.json({
        ok: true,
        data: {
          organisationName: org.name,
          organisationSlug: org.slug,
          sites,
          privacyNotice: 'Your personal data will be processed for visitor management and site security. Data is retained per organisation policy.',
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/invite/:token', async (req, res) => {
    try {
      const [[visit]] = await pool.query(
        `SELECT vis.id, vis.status, vis.purpose, vis.expected_at, vis.pass_code, vis.privacy_ack_at,
                v.full_name, v.phone, v.email, v.company,
                h.name AS host_name, s.name AS site_name, vc.name AS category_name
         FROM visits vis
         INNER JOIN visitors v ON v.id = vis.visitor_id
         LEFT JOIN hosts h ON h.id = vis.host_id
         LEFT JOIN sites s ON s.id = vis.site_id
         LEFT JOIN visitor_categories vc ON vc.id = vis.category_id
         WHERE vis.invite_token = ?`,
        [req.params.token],
      );

      if (!visit) return res.status(404).json({ ok: false, message: 'Invitation not found or expired.' });

      res.json({ ok: true, data: visit });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/invite/:token/confirm', async (req, res) => {
    try {
      const { privacyAccepted, fullName, phone, email, company } = req.body || {};
      if (!privacyAccepted) {
        return res.status(400).json({ ok: false, message: 'Privacy notice must be accepted.' });
      }

      const [[visit]] = await pool.query(
        `SELECT vis.*, v.full_name FROM visits vis
         INNER JOIN visitors v ON v.id = vis.visitor_id
         WHERE vis.invite_token = ?`,
        [req.params.token],
      );
      if (!visit) return res.status(404).json({ ok: false, message: 'Invitation not found.' });
      if (!['pre_registered', 'pending_approval', 'approved'].includes(visit.status)) {
        return res.status(400).json({ ok: false, message: 'This invitation is no longer active.' });
      }

      if (fullName?.trim()) {
        await pool.query(
          `UPDATE visitors SET full_name = ?, phone = COALESCE(?, phone), email = COALESCE(?, email), company = COALESCE(?, company), updated_at = NOW()
           WHERE id = ?`,
          [fullName.trim(), phone || null, email || null, company || null, visit.visitor_id],
        );
      }

      await pool.query(
        `UPDATE visits SET privacy_ack_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [visit.id],
      );

      await writeVisitEvent(pool, {
        visitId: visit.id,
        eventType: 'invite_confirmed',
        details: { source: 'self_service' },
      });

      if (visit.status === 'pre_registered') {
        await pool.query(`UPDATE visits SET status = 'pending_approval' WHERE id = ?`, [visit.id]);
        await notifyVisitEvent(pool, { visitId: visit.id, eventType: 'pending_approval' });
      }

      res.json({ ok: true, data: { passCode: visit.pass_code, status: visit.status } });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/lookup', async (req, res) => {
    try {
      const org = await resolveOrg(req.body?.org);
      if (!org) return res.status(404).json({ ok: false, message: 'Organisation not found.' });

      const query = String(req.body?.query || '').trim();
      if (!query) return res.status(400).json({ ok: false, message: 'Pass code or reference is required.' });

      const [rows] = await pool.query(
        `SELECT vis.id, vis.status, vis.pass_code, vis.badge_number, vis.checked_in_at,
                v.full_name, v.company, h.name AS host_name
         FROM visits vis
         INNER JOIN visitors v ON v.id = vis.visitor_id
         LEFT JOIN hosts h ON h.id = vis.host_id
         WHERE vis.organisation_id = ?
         AND (vis.pass_code = ? OR vis.id = ? OR v.phone = ?)
         ORDER BY vis.created_at DESC
         LIMIT 5`,
        [org.id, query.toUpperCase(), query, query],
      );

      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/check-in', async (req, res) => {
    try {
      const org = await resolveOrg(req.body?.org);
      if (!org) return res.status(404).json({ ok: false, message: 'Organisation not found.' });

      const { visitId, passCode, privacyAccepted } = req.body || {};
      if (!privacyAccepted) {
        return res.status(400).json({ ok: false, message: 'Privacy notice must be accepted.' });
      }

      let visit = null;
      if (visitId) {
        const [[row]] = await pool.query(`SELECT * FROM visits WHERE id = ? AND organisation_id = ?`, [visitId, org.id]);
        visit = row;
      } else if (passCode) {
        const [[row]] = await pool.query(
          `SELECT * FROM visits WHERE organisation_id = ? AND pass_code = ? ORDER BY created_at DESC LIMIT 1`,
          [org.id, String(passCode).trim().toUpperCase()],
        );
        visit = row;
      }

      if (!visit) return res.status(404).json({ ok: false, message: 'Visit not found.' });
      if (visit.status === 'checked_in') {
        return res.status(400).json({ ok: false, message: 'Already checked in.' });
      }
      if (!canTransition(visit.status, 'checked_in')) {
        return res.status(400).json({ ok: false, message: 'Visit is not approved for check-in yet.' });
      }

      const [[visitor]] = await pool.query('SELECT full_name, phone, email FROM visitors WHERE id = ?', [visit.visitor_id]);
      const matches = await findWatchlistMatches(pool, org.id, {
        fullName: visitor?.full_name,
        phone: visitor?.phone,
        email: visitor?.email,
      });
      if (matches.length) {
        return res.status(403).json({ ok: false, message: 'Please see reception — additional verification required.', watchlistMatch: true });
      }

      await pool.query(
        `UPDATE visits SET status = 'checked_in', checked_in_at = NOW(), privacy_ack_at = COALESCE(privacy_ack_at, NOW()), updated_at = NOW() WHERE id = ?`,
        [visit.id],
      );

      await writeVisitEvent(pool, {
        visitId: visit.id,
        eventType: 'checked_in',
        details: { source: 'kiosk' },
      });

      await notifyVisitEvent(pool, { visitId: visit.id, eventType: 'checked_in' });

      res.json({ ok: true, data: { passCode: visit.pass_code, badgeNumber: visit.badge_number } });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/check-out', async (req, res) => {
    try {
      const org = await resolveOrg(req.body?.org);
      if (!org) return res.status(404).json({ ok: false, message: 'Organisation not found.' });

      const passCode = String(req.body?.passCode || req.body?.query || '').trim().toUpperCase();
      if (!passCode) return res.status(400).json({ ok: false, message: 'Pass code is required.' });

      const [[visit]] = await pool.query(
        `SELECT * FROM visits WHERE organisation_id = ? AND pass_code = ? AND status = 'checked_in' LIMIT 1`,
        [org.id, passCode],
      );
      if (!visit) return res.status(404).json({ ok: false, message: 'No active check-in found for this pass code.' });

      await pool.query(
        `UPDATE visits SET status = 'checked_out', checked_out_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [visit.id],
      );

      if (visit.badge_number) {
        await pool.query(
          `UPDATE badges SET status = 'available', visit_id = NULL, returned_at = NOW() WHERE organisation_id = ? AND badge_number = ?`,
          [org.id, visit.badge_number],
        );
      }

      await writeVisitEvent(pool, {
        visitId: visit.id,
        eventType: 'checked_out',
        details: { source: 'kiosk' },
      });

      await notifyVisitEvent(pool, { visitId: visit.id, eventType: 'checked_out' });

      res.json({ ok: true, message: 'Thank you — you have been checked out.' });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  return router;
}
