import { Router, Response } from 'express';
import { prisma } from '../config/database';
import { logAction } from '../services/log.service';
import { propagatePaymentUrl } from '../services/payment.service';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

function paramId(req: AuthRequest): string {
  return String(req.params.id);
}

const router = Router();
router.use(authMiddleware);

// GET /api/payments — list all
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const gateways = await prisma.paymentGateway.findMany({
      include: {
        spareUrls: { orderBy: { createdAt: 'asc' } },
        linkedSites: {
          include: { site: { select: { id: true, name: true } } },
        },
        site: { select: { id: true, name: true, status: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ gateways });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/payments/:id — detail
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const gateway = await prisma.paymentGateway.findUnique({
      where: { id: paramId(req) },
      include: {
        spareUrls: { orderBy: { createdAt: 'asc' } },
        linkedSites: {
          include: {
            site: { select: { id: true, name: true, status: true, deployPath: true } },
          },
        },
        site: { select: { id: true, name: true, status: true } },
      },
    });
    if (!gateway) {
      res.status(404).json({ error: 'Платёжка не найдена' });
      return;
    }
    res.json({ gateway });
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/payments — create
router.post('/', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, currentUrl, siteId, spareUrls } = req.body;

    if (!name || !currentUrl) {
      res.status(400).json({ error: 'Название и URL обязательны' });
      return;
    }

    const gateway = await prisma.paymentGateway.create({
      data: {
        name,
        type: type || 'CUSTOM',
        currentUrl,
        siteId: siteId || null,
        status: 'ACTIVE',
      },
    });

    // Add spare URLs if provided
    if (spareUrls && Array.isArray(spareUrls)) {
      for (const url of spareUrls) {
        if (url) {
          await prisma.paymentSpareUrl.create({
            data: { paymentGatewayId: gateway.id, url },
          });
        }
      }
    }

    await logAction({
      userId: req.user!.id,
      action: 'payment_create',
      target: name,
      details: { type, currentUrl },
      ip: req.ip || '',
    });

    const full = await prisma.paymentGateway.findUnique({
      where: { id: gateway.id },
      include: { spareUrls: true, linkedSites: true },
    });

    res.status(201).json({ gateway: full });
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/payments/:id — update
router.put('/:id', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const id = paramId(req);
    const existing = await prisma.paymentGateway.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Платёжка не найдена' });
      return;
    }

    const { name, type, currentUrl, siteId, status } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type;
    if (currentUrl !== undefined) data.currentUrl = currentUrl;
    if (siteId !== undefined) data.siteId = siteId || null;
    if (status !== undefined) data.status = status;

    const gateway = await prisma.paymentGateway.update({ where: { id }, data });

    await logAction({
      userId: req.user!.id,
      action: 'payment_update',
      target: gateway.name,
      details: { changes: Object.keys(data) },
      ip: req.ip || '',
    });

    res.json({ gateway });
  } catch (error) {
    console.error('Update payment error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/payments/:id — delete
router.delete('/:id', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const id = paramId(req);
    const gateway = await prisma.paymentGateway.findUnique({ where: { id } });
    if (!gateway) {
      res.status(404).json({ error: 'Платёжка не найдена' });
      return;
    }

    // Cascade deletes spareUrls and linkedSites via onDelete: Cascade
    await prisma.sitePaymentGateway.deleteMany({ where: { paymentGatewayId: id } });
    await prisma.paymentSpareUrl.deleteMany({ where: { paymentGatewayId: id } });
    await prisma.paymentGateway.delete({ where: { id } });

    await logAction({
      userId: req.user!.id,
      action: 'payment_delete',
      target: gateway.name,
      ip: req.ip || '',
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete payment error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/payments/:id/spare-urls — add spare URL
router.post('/:id/spare-urls', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const id = paramId(req);
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ error: 'URL обязателен' });
      return;
    }

    const gateway = await prisma.paymentGateway.findUnique({ where: { id } });
    if (!gateway) {
      res.status(404).json({ error: 'Платёжка не найдена' });
      return;
    }

    const spareUrl = await prisma.paymentSpareUrl.create({
      data: { paymentGatewayId: id, url },
    });

    res.status(201).json({ spareUrl });
  } catch (error) {
    console.error('Add spare URL error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/payments/:id/spare-urls/:urlId — remove spare URL
router.delete('/:id/spare-urls/:urlId', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const urlId = String(req.params.urlId);
    await prisma.paymentSpareUrl.delete({ where: { id: urlId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete spare URL error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/payments/:id/link — link a site
router.post('/:id/link', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const id = paramId(req);
    const { siteId, envVarName } = req.body;

    if (!siteId) {
      res.status(400).json({ error: 'siteId обязателен' });
      return;
    }

    const gateway = await prisma.paymentGateway.findUnique({ where: { id } });
    if (!gateway) {
      res.status(404).json({ error: 'Платёжка не найдена' });
      return;
    }

    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      res.status(400).json({ error: 'Сайт не найден' });
      return;
    }

    const link = await prisma.sitePaymentGateway.create({
      data: {
        siteId,
        paymentGatewayId: id,
        envVarName: envVarName || 'PAYMENT_URL',
      },
    });

    await logAction({
      userId: req.user!.id,
      action: 'payment_link_site',
      target: gateway.name,
      details: { siteName: site.name, envVarName: envVarName || 'PAYMENT_URL' },
      ip: req.ip || '',
    });

    res.status(201).json({ link });
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Сайт уже привязан к этой платёжке' });
      return;
    }
    console.error('Link site error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/payments/:id/link/:siteId — unlink a site
router.delete('/:id/link/:siteId', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const id = paramId(req);
    const siteId = String(req.params.siteId);

    const link = await prisma.sitePaymentGateway.findUnique({
      where: { siteId_paymentGatewayId: { siteId, paymentGatewayId: id } },
    });
    if (!link) {
      res.status(404).json({ error: 'Связь не найдена' });
      return;
    }

    await prisma.sitePaymentGateway.delete({ where: { id: link.id } });

    await logAction({
      userId: req.user!.id,
      action: 'payment_unlink_site',
      target: id,
      details: { siteId },
      ip: req.ip || '',
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Unlink site error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/payments/:id/switch-url — switch URL + propagate
router.post('/:id/switch-url', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const id = paramId(req);
    const { newUrl, spareUrlId } = req.body;

    const gateway = await prisma.paymentGateway.findUnique({
      where: { id },
      include: { spareUrls: true },
    });

    if (!gateway) {
      res.status(404).json({ error: 'Платёжка не найдена' });
      return;
    }

    if (gateway.status === 'SWITCHING') {
      res.status(409).json({ error: 'Переключение уже выполняется' });
      return;
    }

    // Determine target URL
    let targetUrl: string;
    if (spareUrlId) {
      const spare = gateway.spareUrls.find(s => s.id === spareUrlId);
      if (!spare) {
        res.status(400).json({ error: 'Запасной URL не найден' });
        return;
      }
      targetUrl = spare.url;
    } else if (newUrl) {
      targetUrl = newUrl;
    } else {
      res.status(400).json({ error: 'Укажите newUrl или spareUrlId' });
      return;
    }

    const oldUrl = gateway.currentUrl;

    // Mark as switching
    await prisma.paymentGateway.update({
      where: { id },
      data: { status: 'SWITCHING' },
    });

    // Propagate to all linked sites
    const result = await propagatePaymentUrl(id, targetUrl, req.user!.id);

    // Update gateway
    await prisma.paymentGateway.update({
      where: { id },
      data: {
        currentUrl: targetUrl,
        status: result.failed === 0 ? 'ACTIVE' : 'ERROR',
        lastSwitchAt: new Date(),
      },
    });

    res.json({ oldUrl, newUrl: targetUrl, ...result });
  } catch (error) {
    console.error('Switch URL error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/payments/:id/retry-propagation — retry failed
router.post('/:id/retry-propagation', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const id = paramId(req);
    const gateway = await prisma.paymentGateway.findUnique({ where: { id } });
    if (!gateway) {
      res.status(404).json({ error: 'Платёжка не найдена' });
      return;
    }

    const result = await propagatePaymentUrl(id, gateway.currentUrl, req.user!.id, true);

    // Update status if all now ok
    if (result.failed === 0) {
      await prisma.paymentGateway.update({
        where: { id },
        data: { status: 'ACTIVE' },
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Retry propagation error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
