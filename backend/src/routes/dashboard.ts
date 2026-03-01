import { Router, Response } from 'express';
import { prisma } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// GET /api/dashboard
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const [
      totalSites,
      onlineSites,
      offlineSites,
      deployingSites,
      totalServers,
      onlineServers,
      totalDomains,
      freeDomains,
      abusedDomains,
      totalBackups,
      successBackups,
      recentDeploys,
      recentLogs,
    ] = await Promise.all([
      prisma.site.count(),
      prisma.site.count({ where: { status: 'ONLINE' } }),
      prisma.site.count({ where: { status: 'OFFLINE' } }),
      prisma.site.count({ where: { status: 'DEPLOYING' } }),
      prisma.server.count(),
      prisma.server.count({ where: { status: 'ONLINE' } }),
      prisma.domain.count(),
      prisma.domain.count({ where: { status: 'FREE' } }),
      prisma.domain.count({ where: { status: 'ABUSED' } }),
      prisma.backup.count(),
      prisma.backup.count({ where: { status: 'SUCCESS' } }),
      prisma.deploy.findMany({
        orderBy: { startedAt: 'desc' },
        take: 5,
        include: {
          site: { select: { id: true, name: true } },
          user: { select: { id: true, username: true } },
        },
      }),
      prisma.log.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          user: { select: { id: true, username: true } },
          site: { select: { id: true, name: true } },
        },
      }),
    ]);

    res.json({
      stats: {
        sites: { total: totalSites, online: onlineSites, offline: offlineSites, deploying: deployingSites },
        servers: { total: totalServers, online: onlineServers },
        domains: { total: totalDomains, free: freeDomains, abused: abusedDomains },
        backups: { total: totalBackups, success: successBackups },
      },
      recentDeploys,
      recentLogs,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
