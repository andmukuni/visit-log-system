import express from 'express';
import pool from '../db.js';
import {
  resolveBoardByToken,
  listSignatureRequests,
  signSignatureRequest,
  subscribeToSiteBoard,
} from '../signatureBoardService.js';

const HEARTBEAT_INTERVAL_MS = 20_000;

export function createSignatureBoardRouter() {
  const router = express.Router();

  router.get('/:token', async (req, res) => {
    try {
      const board = await resolveBoardByToken(pool, req.params.token);
      if (!board) return res.status(404).json({ ok: false, message: 'Signature board not found.' });

      res.json({
        ok: true,
        data: {
          siteId: board.site_id,
          siteName: board.site_name || '',
          organisationName: board.organisation_name || '',
        },
      });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/:token/requests', async (req, res) => {
    try {
      const board = await resolveBoardByToken(pool, req.params.token);
      if (!board) return res.status(404).json({ ok: false, message: 'Signature board not found.' });

      const data = await listSignatureRequests(pool, {
        siteId: board.site_id,
        page: req.query.page,
        pageSize: req.query.pageSize,
      });
      res.json({ ok: true, data });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  router.get('/:token/stream', async (req, res) => {
    const board = await resolveBoardByToken(pool, req.params.token).catch(() => null);
    if (!board) {
      res.status(404).end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 5000\n\n');

    const unsubscribe = subscribeToSiteBoard(board.site_id, (evt) => {
      res.write(`event: ${evt.type}\ndata: ${JSON.stringify(evt.payload)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, HEARTBEAT_INTERVAL_MS);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  });

  router.post('/:token/requests/:requestId/sign', async (req, res) => {
    try {
      const board = await resolveBoardByToken(pool, req.params.token);
      if (!board) return res.status(404).json({ ok: false, message: 'Signature board not found.' });

      const result = await signSignatureRequest(pool, {
        boardSiteId: board.site_id,
        requestId: req.params.requestId,
        signatureData: req.body?.signatureData,
      });
      if (!result.ok) return res.status(result.status || 400).json({ ok: false, message: result.message });

      res.json({ ok: true, data: result.data });
    } catch (error) {
      res.status(500).json({ ok: false, message: error.message });
    }
  });

  return router;
}
