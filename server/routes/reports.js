import express from 'express';
import pool from '../db.js';
import { requireUserScope } from '../scopeService.js';
import {
  listAvailableReports,
  userCanRunReport,
  runReportQuery,
  applyMasking,
  rowsToCsv,
  recordExport,
  listExports,
} from '../reportService.js';

export function createReportsRouter() {
  const router = express.Router();

  async function getContext(req) {
    return requireUserScope(pool, req.adminClaims?.sub, req.adminClaims);
  }

  router.get('/types', async (req, res) => {
    try {
      const perms = req.adminClaims?.permissions || [];
      res.json({ ok: true, data: listAvailableReports(perms) });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/preview', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });
      if (!ctx.scope?.organisation_id) {
        return res.json({ ok: true, data: { rows: [], total: 0, columns: [], maskLevel: 'minimum' } });
      }

      const reportType = String(req.query.type || '').trim();
      const perms = req.adminClaims?.permissions || [];
      if (!userCanRunReport(perms, reportType)) {
        return res.status(403).json({ ok: false, message: 'You are not authorised to run this report.' });
      }

      const result = await runReportQuery(pool, {
        reportType,
        scope: ctx.scope,
        elevated: ctx.elevated,
        filters: req.query,
      });

      const { rows, maskLevel } = applyMasking(result.rows, perms, reportType);

      res.json({
        ok: true,
        data: {
          rows,
          total: result.total,
          columns: result.columns,
          page: result.filters.page,
          limit: result.filters.limit,
          maskLevel,
          reportType,
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.post('/export', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });
      if (!ctx.scope?.organisation_id) {
        return res.status(400).json({ ok: false, message: 'No organisation scope.' });
      }

      const {
        type: reportType,
        format = 'csv',
        purpose = '',
        filters = {},
      } = req.body || {};

      const perms = req.adminClaims?.permissions || [];
      if (!userCanRunReport(perms, reportType)) {
        return res.status(403).json({ ok: false, message: 'You are not authorised to export this report.' });
      }

      if (!['csv', 'json'].includes(format)) {
        return res.status(400).json({ ok: false, message: 'Supported formats: csv, json.' });
      }

      if (!purpose?.trim()) {
        return res.status(400).json({ ok: false, message: 'Export purpose is required for audit compliance.' });
      }

      const exportFilters = { ...filters, limit: 10000, page: 1 };
      const result = await runReportQuery(pool, {
        reportType,
        scope: ctx.scope,
        elevated: ctx.elevated,
        filters: exportFilters,
      });

      const { rows, maskLevel } = applyMasking(result.rows, perms, reportType);

      await recordExport(pool, {
        organisationId: ctx.scope.organisation_id,
        userId: req.adminClaims.sub,
        reportType,
        format,
        purpose: purpose.trim(),
        filters: exportFilters,
        rowCount: rows.length,
        maskLevel,
        ipAddress: req.ip,
      });

      if (format === 'json') {
        return res.json({
          ok: true,
          data: {
            rows,
            total: rows.length,
            columns: result.columns,
            maskLevel,
            reportType,
          },
        });
      }

      const csv = rowsToCsv(rows, result.columns);
      const filename = `${reportType}-report-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csv);
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/exports', async (req, res) => {
    try {
      const ctx = await getContext(req);
      if (!ctx.ok) return res.status(ctx.status).json({ ok: false, message: ctx.message });
      if (!ctx.scope?.organisation_id) {
        return res.json({ ok: true, data: [] });
      }

      const perms = req.adminClaims?.permissions || [];
      const canView = perms.includes('super_admin')
        || perms.includes('*')
        || perms.includes('management.exports')
        || perms.includes('compliance.exports')
        || perms.includes('admin.dashboard');
      if (!canView) {
        return res.status(403).json({ ok: false, message: 'Insufficient permissions to view export history.' });
      }

      const rows = await listExports(pool, ctx.scope, { elevated: ctx.elevated });
      res.json({ ok: true, data: rows });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  return router;
}
