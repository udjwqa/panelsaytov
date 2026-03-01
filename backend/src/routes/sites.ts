import { Router, Response } from 'express';
import { prisma } from '../config/database';
import { logAction } from '../services/log.service';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

function paramId(req: AuthRequest): string {
  return String(req.params.id);
}

const router = Router();
router.use(authMiddleware);

// GET /api/sites
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const sites = await prisma.site.findMany({
      include: {
        server: { select: { id: true, name: true, ip: true } },
        domain: { select: { id: true, domain: true, sslExpiresAt: true } },
        _count: { select: { deploys: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ sites });
  } catch (error) {
    console.error('Get sites error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/sites/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const site = await prisma.site.findUnique({
      where: { id: paramId(req) },
      include: {
        server: { select: { id: true, name: true, ip: true } },
        domain: true,
        spareDomains: { select: { id: true, domain: true, status: true } },
        deploys: {
          orderBy: { startedAt: 'desc' },
          take: 10,
          select: { id: true, status: true, startedAt: true, finishedAt: true, duration: true },
        },
      },
    });

    if (!site) {
      res.status(404).json({ error: 'Сайт не найден' });
      return;
    }

    res.json({ site });
  } catch (error) {
    console.error('Get site error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/sites
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const {
      name, sourceType, repoUrl, branch, deployPath, stack,
      customScript, envVars, serverId, domainId, spareDomainIds,
      port, autoRotation, autoRotateAfter,
    } = req.body;

    if (!name || !deployPath || !serverId) {
      res.status(400).json({ error: 'Название, путь деплоя и сервер обязательны' });
      return;
    }

    // Verify server exists
    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) {
      res.status(400).json({ error: 'Сервер не найден' });
      return;
    }

    const data: any = {
      name,
      sourceType: sourceType || 'GIT',
      repoUrl: repoUrl || null,
      branch: branch || 'main',
      deployPath,
      stack: stack || 'AUTO',
      customScript: customScript || null,
      envVars: envVars || null,
      serverId,
      port: port || 3000,
      autoRotation: autoRotation || false,
      autoRotateAfter: autoRotateAfter || 5,
    };

    if (domainId) {
      // Verify domain is free
      const domain = await prisma.domain.findUnique({ where: { id: domainId } });
      if (!domain) {
        res.status(400).json({ error: 'Домен не найден' });
        return;
      }
      data.domainId = domainId;
    }

    const site = await prisma.site.create({
      data,
      include: {
        server: { select: { id: true, name: true } },
        domain: { select: { id: true, domain: true } },
      },
    });

    // Update domain status to ACTIVE
    if (domainId) {
      await prisma.domain.update({ where: { id: domainId }, data: { status: 'ACTIVE' } });
    }

    // Connect spare domains
    if (spareDomainIds && spareDomainIds.length > 0) {
      await prisma.site.update({
        where: { id: site.id },
        data: {
          spareDomains: { connect: spareDomainIds.map((id: string) => ({ id })) },
        },
      });
    }

    await logAction({
      userId: req.user!.id,
      siteId: site.id,
      action: 'site_add',
      target: name,
      ip: req.ip || '',
    });

    res.status(201).json({ site });
  } catch (error) {
    console.error('Create site error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/sites/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = paramId(req);
    const existing = await prisma.site.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Сайт не найден' });
      return;
    }

    const {
      name, sourceType, repoUrl, branch, deployPath, stack,
      customScript, envVars, serverId, domainId, port,
      autoRotation, autoRotateAfter,
    } = req.body;

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (sourceType !== undefined) data.sourceType = sourceType;
    if (repoUrl !== undefined) data.repoUrl = repoUrl;
    if (branch !== undefined) data.branch = branch;
    if (deployPath !== undefined) data.deployPath = deployPath;
    if (stack !== undefined) data.stack = stack;
    if (customScript !== undefined) data.customScript = customScript;
    if (envVars !== undefined) data.envVars = envVars;
    if (serverId !== undefined) data.serverId = serverId;
    if (domainId !== undefined) data.domainId = domainId || null;
    if (port !== undefined) data.port = port;
    if (autoRotation !== undefined) data.autoRotation = autoRotation;
    if (autoRotateAfter !== undefined) data.autoRotateAfter = autoRotateAfter;

    const site = await prisma.site.update({ where: { id }, data });

    await logAction({
      userId: req.user!.id,
      siteId: site.id,
      action: 'site_update',
      target: site.name,
      details: { changes: Object.keys(data) },
      ip: req.ip || '',
    });

    res.json({ site });
  } catch (error) {
    console.error('Update site error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/sites/:id
router.delete('/:id', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const id = paramId(req);
    const site = await prisma.site.findUnique({ where: { id } });
    if (!site) {
      res.status(404).json({ error: 'Сайт не найден' });
      return;
    }

    // Free the domain
    if (site.domainId) {
      await prisma.domain.update({ where: { id: site.domainId }, data: { status: 'FREE' } });
    }

    // Delete related deploys and logs first
    await prisma.deploy.deleteMany({ where: { siteId: id } });
    await prisma.log.deleteMany({ where: { siteId: id } });
    await prisma.site.delete({ where: { id } });

    await logAction({
      userId: req.user!.id,
      action: 'site_remove',
      target: site.name,
      ip: req.ip || '',
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete site error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/sites/:id/switch-domain
router.post('/:id/switch-domain', async (req: AuthRequest, res: Response) => {
  try {
    const id = paramId(req);
    const { newDomainId } = req.body;

    const site = await prisma.site.findUnique({
      where: { id },
      include: { domain: true },
    });

    if (!site) {
      res.status(404).json({ error: 'Сайт не найден' });
      return;
    }

    const newDomain = await prisma.domain.findUnique({ where: { id: newDomainId } });
    if (!newDomain) {
      res.status(400).json({ error: 'Новый домен не найден' });
      return;
    }

    // Free old domain
    if (site.domainId) {
      await prisma.domain.update({ where: { id: site.domainId }, data: { status: 'FREE' } });
    }

    // Set new domain
    await prisma.site.update({ where: { id }, data: { domainId: newDomainId } });
    await prisma.domain.update({ where: { id: newDomainId }, data: { status: 'ACTIVE' } });

    const oldDomain = site.domain?.domain || 'нет';

    await logAction({
      userId: req.user!.id,
      siteId: site.id,
      action: 'domain_switch',
      target: site.name,
      details: { from: oldDomain, to: newDomain.domain },
      ip: req.ip || '',
    });

    res.json({ success: true, oldDomain: oldDomain, newDomain: newDomain.domain });
  } catch (error) {
    console.error('Switch domain error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
