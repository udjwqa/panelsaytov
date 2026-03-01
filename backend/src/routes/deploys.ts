import { Router, Response } from 'express';
import { prisma } from '../config/database';
import { addDeployJob } from '../services/queue.service';
import { logAction } from '../services/log.service';
import { authMiddleware, AuthRequest } from '../middleware/auth';

function paramId(req: AuthRequest): string {
  return String(req.params.id);
}

const router = Router();
router.use(authMiddleware);

// GET /api/deploys - list deploys (recent, across all sites)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const siteId = req.query.siteId as string | undefined;
    const where = siteId ? { siteId } : {};

    const deploys = await prisma.deploy.findMany({
      where,
      include: {
        site: { select: { id: true, name: true } },
        user: { select: { id: true, username: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });

    res.json({ deploys });
  } catch (error) {
    console.error('Get deploys error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/deploys/:id - get deploy details with full log
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const deploy = await prisma.deploy.findUnique({
      where: { id: paramId(req) },
      include: {
        site: { select: { id: true, name: true, deployPath: true } },
        user: { select: { id: true, username: true } },
      },
    });

    if (!deploy) {
      res.status(404).json({ error: 'Деплой не найден' });
      return;
    }

    res.json({ deploy });
  } catch (error) {
    console.error('Get deploy error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/deploys - create a new deploy (trigger deploy for a site)
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { siteId, withSsl } = req.body;

    if (!siteId) {
      res.status(400).json({ error: 'siteId обязателен' });
      return;
    }

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      include: { server: true, domain: true },
    });

    if (!site) {
      res.status(404).json({ error: 'Сайт не найден' });
      return;
    }

    // Check for active deploy on this site
    const activeDeploy = await prisma.deploy.findFirst({
      where: { siteId, status: { in: ['PENDING', 'RUNNING'] } },
    });

    if (activeDeploy) {
      res.status(400).json({ error: 'Деплой уже выполняется' });
      return;
    }

    const deploy = await prisma.deploy.create({
      data: {
        siteId,
        userId: req.user!.id,
        serverId: site.serverId,
        domainId: site.domainId,
        withSsl: withSsl !== false,
        status: 'PENDING',
      },
      include: {
        site: { select: { id: true, name: true } },
        user: { select: { id: true, username: true } },
      },
    });

    // Update site status
    await prisma.site.update({
      where: { id: siteId },
      data: { status: 'DEPLOYING' },
    });

    // Add to queue
    await addDeployJob(deploy.id);

    await logAction({
      userId: req.user!.id,
      siteId,
      action: 'deploy_start',
      target: site.name,
      ip: req.ip || '',
    });

    res.status(201).json({ deploy });
  } catch (error) {
    console.error('Create deploy error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/deploys/:id/cancel
router.post('/:id/cancel', async (req: AuthRequest, res: Response) => {
  try {
    const deploy = await prisma.deploy.findUnique({
      where: { id: paramId(req) },
      include: { site: { select: { id: true, name: true } } },
    });

    if (!deploy) {
      res.status(404).json({ error: 'Деплой не найден' });
      return;
    }

    if (!['PENDING', 'RUNNING'].includes(deploy.status)) {
      res.status(400).json({ error: 'Деплой уже завершён' });
      return;
    }

    await prisma.deploy.update({
      where: { id: deploy.id },
      data: { status: 'CANCELLED', finishedAt: new Date() },
    });

    await prisma.site.update({
      where: { id: deploy.siteId },
      data: { status: 'UNKNOWN' },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Cancel deploy error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
