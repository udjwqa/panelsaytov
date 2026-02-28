import { Router, Response } from 'express';
import { prisma } from '../config/database';
import { encrypt } from '../utils/crypto';
import { testSSHConnection, pingServer, getServerStats } from '../services/ssh.service';
import { logAction } from '../services/log.service';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

const router = Router();
router.use(authMiddleware);

// GET /api/servers
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const servers = await prisma.server.findMany({
      include: { _count: { select: { sites: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const result = servers.map((s) => ({
      id: s.id,
      name: s.name,
      ip: s.ip,
      sshPort: s.sshPort,
      sshAuthType: s.sshAuthType,
      sshUser: s.sshUser,
      provider: s.provider,
      location: s.location,
      isSpare: s.isSpare,
      status: s.status,
      lastPing: s.lastPing,
      cpuUsage: s.cpuUsage,
      ramUsage: s.ramUsage,
      diskUsage: s.diskUsage,
      sitesCount: s._count.sites,
      createdAt: s.createdAt,
    }));

    res.json({ servers: result });
  } catch (error) {
    console.error('Get servers error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/servers/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.id },
      include: {
        sites: {
          select: { id: true, name: true, status: true, domain: { select: { domain: true } } },
        },
      },
    });

    if (!server) {
      res.status(404).json({ error: 'Сервер не найден' });
      return;
    }

    const { sshPassword, sshKey, ...safe } = server;
    res.json({
      server: {
        ...safe,
        hasPassword: !!sshPassword,
        hasKey: !!sshKey,
      },
    });
  } catch (error) {
    console.error('Get server error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/servers
router.post('/', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, ip, sshPort, sshAuthType, sshUser, sshPassword, sshKey, provider, location, isSpare } = req.body;

    if (!name || !ip) {
      res.status(400).json({ error: 'Название и IP обязательны' });
      return;
    }

    const data: any = {
      name,
      ip,
      sshPort: sshPort || 22,
      sshAuthType: sshAuthType || 'KEY',
      sshUser: sshUser || 'root',
      provider: provider || null,
      location: location || null,
      isSpare: isSpare || false,
    };

    if (sshPassword) data.sshPassword = encrypt(sshPassword);
    if (sshKey) data.sshKey = encrypt(sshKey);

    const server = await prisma.server.create({ data });

    await logAction({
      userId: req.user!.id,
      action: 'server_add',
      target: `${name} (${ip})`,
      ip: req.ip || '',
    });

    res.status(201).json({ server });
  } catch (error) {
    console.error('Create server error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/servers/:id
router.put('/:id', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, ip, sshPort, sshAuthType, sshUser, sshPassword, sshKey, provider, location, isSpare } = req.body;

    const existing = await prisma.server.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Сервер не найден' });
      return;
    }

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (ip !== undefined) data.ip = ip;
    if (sshPort !== undefined) data.sshPort = sshPort;
    if (sshAuthType !== undefined) data.sshAuthType = sshAuthType;
    if (sshUser !== undefined) data.sshUser = sshUser;
    if (provider !== undefined) data.provider = provider;
    if (location !== undefined) data.location = location;
    if (isSpare !== undefined) data.isSpare = isSpare;
    if (sshPassword) data.sshPassword = encrypt(sshPassword);
    if (sshKey) data.sshKey = encrypt(sshKey);

    const server = await prisma.server.update({ where: { id }, data });

    await logAction({
      userId: req.user!.id,
      action: 'server_update',
      target: `${server.name} (${server.ip})`,
      details: { changes: Object.keys(data) },
      ip: req.ip || '',
    });

    res.json({ server });
  } catch (error) {
    console.error('Update server error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/servers/:id
router.delete('/:id', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const server = await prisma.server.findUnique({
      where: { id },
      include: { _count: { select: { sites: true } } },
    });

    if (!server) {
      res.status(404).json({ error: 'Сервер не найден' });
      return;
    }

    if (server._count.sites > 0) {
      res.status(400).json({ error: `На сервере ${server._count.sites} сайтов. Сначала перенесите или удалите их.` });
      return;
    }

    await prisma.server.delete({ where: { id } });

    await logAction({
      userId: req.user!.id,
      action: 'server_remove',
      target: `${server.name} (${server.ip})`,
      ip: req.ip || '',
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete server error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/servers/:id/ping
router.post('/:id/ping', async (req: AuthRequest, res: Response) => {
  try {
    const server = await prisma.server.findUnique({ where: { id: req.params.id } });
    if (!server) {
      res.status(404).json({ error: 'Сервер не найден' });
      return;
    }

    const result = await pingServer(server.ip);

    await prisma.server.update({
      where: { id: server.id },
      data: {
        status: result.success ? 'ONLINE' : 'OFFLINE',
        lastPing: new Date(),
      },
    });

    res.json({ ...result, status: result.success ? 'ONLINE' : 'OFFLINE' });
  } catch (error) {
    console.error('Ping server error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/servers/:id/test-ssh
router.post('/:id/test-ssh', async (req: AuthRequest, res: Response) => {
  try {
    const server = await prisma.server.findUnique({ where: { id: req.params.id } });
    if (!server) {
      res.status(404).json({ error: 'Сервер не найден' });
      return;
    }

    const result = await testSSHConnection({
      ip: server.ip,
      port: server.sshPort,
      username: server.sshUser,
      authType: server.sshAuthType,
      password: server.sshPassword,
      privateKey: server.sshKey,
    });

    if (result.success) {
      await prisma.server.update({
        where: { id: server.id },
        data: { status: 'ONLINE', lastPing: new Date() },
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Test SSH error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/servers/:id/stats
router.get('/:id/stats', async (req: AuthRequest, res: Response) => {
  try {
    const server = await prisma.server.findUnique({ where: { id: req.params.id } });
    if (!server) {
      res.status(404).json({ error: 'Сервер не найден' });
      return;
    }

    const stats = await getServerStats({
      ip: server.ip,
      port: server.sshPort,
      username: server.sshUser,
      authType: server.sshAuthType,
      password: server.sshPassword,
      privateKey: server.sshKey,
    });

    await prisma.server.update({
      where: { id: server.id },
      data: {
        cpuUsage: stats.cpu,
        ramUsage: stats.ram,
        diskUsage: stats.disk,
      },
    });

    res.json(stats);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
