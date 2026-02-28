import { Router, Response } from 'express';
import { prisma } from '../config/database';
import { hashPassword } from '../services/auth.service';
import { logAction } from '../services/log.service';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

const router = Router();

// All settings routes require auth
router.use(authMiddleware);

// GET /api/settings/users
router.get('/users', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        totpEnabled: true,
        createdAt: true,
        updatedAt: true,
        sessions: {
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const result = users.map((u) => ({
      ...u,
      lastLogin: u.sessions[0]?.createdAt || null,
      sessions: undefined,
    }));

    res.json({ users: result });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/settings/users
router.post('/users', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Введите логин и пароль' });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: role === 'ADMIN' ? 'ADMIN' : 'OPERATOR',
      },
      select: { id: true, username: true, role: true, createdAt: true },
    });

    await logAction({
      userId: req.user!.id,
      action: 'user_add',
      target: username,
      details: { role: user.role },
      ip: req.ip || '',
    });

    res.status(201).json({ user });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/settings/users/:id
router.put('/users/:id', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { username, role, password } = req.body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    const data: any = {};
    if (username) data.username = username;
    if (role) data.role = role === 'ADMIN' ? 'ADMIN' : 'OPERATOR';
    if (password) data.passwordHash = await hashPassword(password);

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, username: true, role: true, updatedAt: true },
    });

    await logAction({
      userId: req.user!.id,
      action: 'user_update',
      target: updated.username,
      details: { changes: Object.keys(data) },
      ip: req.ip || '',
    });

    res.json({ user: updated });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/settings/users/:id
router.delete('/users/:id', requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (id === req.user!.id) {
      res.status(400).json({ error: 'Нельзя удалить свой аккаунт' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    // Delete sessions first, then user
    await prisma.session.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });

    await logAction({
      userId: req.user!.id,
      action: 'user_remove',
      target: user.username,
      ip: req.ip || '',
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
