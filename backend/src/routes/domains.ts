import { Router, Response } from 'express';
import { prisma } from '../config/database';
import { encrypt } from '../utils/crypto';
import { logAction } from '../services/log.service';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import dns from 'dns/promises';
import https from 'https';

function paramId(req: AuthRequest): string {
  return String(req.params.id);
}

const router = Router();
router.use(authMiddleware);

// GET /api/domains
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const domains = await prisma.domain.findMany({
      include: {
        site: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ domains });
  } catch (error) {
    console.error('Get domains error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/domains/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const domain = await prisma.domain.findUnique({
      where: { id: paramId(req) },
      include: {
        site: { select: { id: true, name: true } },
        spareSites: { select: { id: true, name: true } },
      },
    });

    if (!domain) {
      res.status(404).json({ error: 'Домен не найден' });
      return;
    }

    const { cloudflareToken, ...safe } = domain;
    res.json({ domain: { ...safe, hasCloudflareToken: !!cloudflareToken } });
  } catch (error) {
    console.error('Get domain error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/domains
router.post('/', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { domain: domainName, cloudflareZone, cloudflareToken, type } = req.body;

    if (!domainName) {
      res.status(400).json({ error: 'Домен обязателен' });
      return;
    }

    const existing = await prisma.domain.findUnique({ where: { domain: domainName } });
    if (existing) {
      res.status(400).json({ error: 'Домен уже существует' });
      return;
    }

    const data: any = {
      domain: domainName,
      cloudflareZone: cloudflareZone || null,
      type: type === 'SPARE' ? 'SPARE' : 'PRIMARY',
    };

    if (cloudflareToken) data.cloudflareToken = encrypt(cloudflareToken);

    const created = await prisma.domain.create({ data });

    await logAction({
      userId: req.user!.id,
      action: 'domain_add',
      target: domainName,
      ip: req.ip || '',
    });

    res.status(201).json({ domain: created });
  } catch (error) {
    console.error('Create domain error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/domains/:id
router.put('/:id', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const id = paramId(req);
    const { domain: domainName, cloudflareZone, cloudflareToken, type } = req.body;

    const existing = await prisma.domain.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Домен не найден' });
      return;
    }

    const data: any = {};
    if (domainName !== undefined) data.domain = domainName;
    if (cloudflareZone !== undefined) data.cloudflareZone = cloudflareZone;
    if (type !== undefined) data.type = type;
    if (cloudflareToken) data.cloudflareToken = encrypt(cloudflareToken);

    const updated = await prisma.domain.update({ where: { id }, data });
    res.json({ domain: updated });
  } catch (error) {
    console.error('Update domain error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/domains/:id
router.delete('/:id', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const id = paramId(req);
    const domain = await prisma.domain.findUnique({ where: { id }, include: { site: true } }) as any;
    if (!domain) {
      res.status(404).json({ error: 'Домен не найден' });
      return;
    }

    if (domain.site) {
      res.status(400).json({ error: 'Домен привязан к сайту. Сначала отвяжите.' });
      return;
    }

    await prisma.domain.delete({ where: { id } });

    await logAction({
      userId: req.user!.id,
      action: 'domain_remove',
      target: domain.domain,
      ip: req.ip || '',
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete domain error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/domains/:id/check-dns
router.post('/:id/check-dns', async (req: AuthRequest, res: Response) => {
  try {
    const domain = await prisma.domain.findUnique({ where: { id: paramId(req) } });
    if (!domain) {
      res.status(404).json({ error: 'Домен не найден' });
      return;
    }

    try {
      const addresses = await dns.resolve4(domain.domain);
      const resolvesTo = addresses[0] || null;

      await prisma.domain.update({
        where: { id: domain.id },
        data: { lastDnsCheck: new Date(), dnsResolvesTo: resolvesTo },
      });

      res.json({ success: true, resolvesTo, addresses });
    } catch {
      await prisma.domain.update({
        where: { id: domain.id },
        data: { lastDnsCheck: new Date(), dnsResolvesTo: null },
      });
      res.json({ success: false, error: 'DNS не резолвится' });
    }
  } catch (error) {
    console.error('Check DNS error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/domains/:id/check-ssl
router.post('/:id/check-ssl', async (req: AuthRequest, res: Response) => {
  try {
    const domain = await prisma.domain.findUnique({ where: { id: paramId(req) } });
    if (!domain) {
      res.status(404).json({ error: 'Домен не найден' });
      return;
    }

    const result = await new Promise<{ valid: boolean; expiresAt?: Date; error?: string }>((resolve) => {
      const req = https.request({ hostname: domain.domain, port: 443, method: 'HEAD', rejectUnauthorized: false }, (response) => {
        const cert = (response.socket as any).getPeerCertificate();
        if (cert && cert.valid_to) {
          resolve({ valid: true, expiresAt: new Date(cert.valid_to) });
        } else {
          resolve({ valid: false, error: 'Нет сертификата' });
        }
      });
      req.on('error', (e) => resolve({ valid: false, error: e.message }));
      req.setTimeout(5000, () => { req.destroy(); resolve({ valid: false, error: 'Таймаут' }); });
      req.end();
    });

    if (result.valid && result.expiresAt) {
      await prisma.domain.update({
        where: { id: domain.id },
        data: { sslExpiresAt: result.expiresAt, sslStatus: 'valid' },
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Check SSL error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/domains/:id/mark-abused
router.post('/:id/mark-abused', async (req: AuthRequest, res: Response) => {
  try {
    const domain = await prisma.domain.findUnique({ where: { id: paramId(req) } });
    if (!domain) {
      res.status(404).json({ error: 'Домен не найден' });
      return;
    }

    await prisma.domain.update({
      where: { id: domain.id },
      data: { status: 'ABUSED' },
    });

    await logAction({
      userId: req.user!.id,
      action: 'domain_abuse',
      target: domain.domain,
      ip: req.ip || '',
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Mark abused error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/domains/:id/restore
router.post('/:id/restore', async (req: AuthRequest, res: Response) => {
  try {
    const domain = await prisma.domain.findUnique({ where: { id: paramId(req) }, include: { site: true } }) as any;
    if (!domain) {
      res.status(404).json({ error: 'Домен не найден' });
      return;
    }

    await prisma.domain.update({
      where: { id: domain.id },
      data: { status: domain.site ? 'ACTIVE' : 'FREE' },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Restore domain error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
