import { Router, Response } from 'express';
import { prisma } from '../config/database';
import {
  comparePassword,
  hashPassword,
  createSession,
  deleteSession,
  refreshSession,
} from '../services/auth.service';
import { logAction } from '../services/log.service';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { setup2FA, confirm2FA, verify2FALogin } from '../services/totp.service';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: AuthRequest, res: Response) => {
  try {
    const { username, password, totpCode } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Введите логин и пароль' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      res.status(401).json({ error: 'Неверный логин или пароль' });
      return;
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Неверный логин или пароль' });
      return;
    }

    // 2FA check
    if (user.totpEnabled) {
      if (!totpCode) {
        // User needs to provide TOTP code
        res.json({
          requireTotp: true,
          userId: user.id,
        });
        return;
      }

      const totpValid = await verify2FALogin(user.id, totpCode);
      if (!totpValid) {
        res.status(401).json({ error: 'Неверный код 2FA' });
        return;
      }
    }

    // If 2FA is not set up yet, user must set it up before proceeding
    if (!user.totpEnabled) {
      const ip = req.ip || req.socket.remoteAddress || '';
      const userAgent = req.headers['user-agent'] || '';
      const { accessToken, refreshToken } = await createSession(user.id, ip, userAgent);

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/api/auth',
      });

      await logAction({
        userId: user.id,
        action: 'login',
        target: user.username,
        ip,
      });

      res.json({
        accessToken,
        requireSetup2FA: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          totpEnabled: false,
        },
      });
      return;
    }

    const ip = req.ip || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    const { accessToken, refreshToken } = await createSession(user.id, ip, userAgent);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    await logAction({
      userId: user.id,
      action: 'login',
      target: user.username,
      ip,
    });

    res.json({
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        totpEnabled: user.totpEnabled,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/auth/logout
router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      await deleteSession(refreshToken);
    }

    await logAction({
      userId: req.user!.id,
      action: 'logout',
      target: req.user!.username,
      ip: req.ip || '',
    });

    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        username: true,
        role: true,
        totpEnabled: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: AuthRequest, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      res.status(401).json({ error: 'Refresh token отсутствует' });
      return;
    }

    const result = await refreshSession(refreshToken);
    if (!result) {
      res.clearCookie('refreshToken', { path: '/api/auth' });
      res.status(401).json({ error: 'Сессия истекла' });
      return;
    }

    res.cookie('refreshToken', result.newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    res.json({ accessToken: result.accessToken });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Введите текущий и новый пароль' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    const valid = await comparePassword(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Неверный текущий пароль' });
      return;
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await logAction({
      userId: user.id,
      action: 'settings_change',
      target: 'password',
      ip: req.ip || '',
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/auth/setup-2fa - generate QR code and secret for 2FA setup
router.post('/setup-2fa', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    if (user.totpEnabled) {
      res.status(400).json({ error: '2FA уже включена' });
      return;
    }

    const result = await setup2FA(user.id);

    res.json({
      qrCode: result.qrCode,
      secret: result.secret,
      backupCodes: result.backupCodes,
    });
  } catch (error) {
    console.error('Setup 2FA error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/auth/confirm-2fa - verify token and enable 2FA
router.post('/confirm-2fa', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({ error: 'Введите код из приложения' });
      return;
    }

    const confirmed = await confirm2FA(req.user!.id, token);

    if (!confirmed) {
      res.status(400).json({ error: 'Неверный код. Попробуйте ещё раз' });
      return;
    }

    await logAction({
      userId: req.user!.id,
      action: 'settings_change',
      target: '2fa_enabled',
      ip: req.ip || '',
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Confirm 2FA error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
