import { prisma } from '../config/database';

interface LogActionParams {
  userId?: string;
  siteId?: string;
  action: string;
  target?: string;
  details?: any;
  status?: string;
  ip?: string;
}

export async function logAction(params: LogActionParams): Promise<void> {
  try {
    await prisma.log.create({
      data: {
        userId: params.userId || null,
        siteId: params.siteId || null,
        action: params.action,
        target: params.target || null,
        details: params.details || null,
        status: params.status || 'success',
        ip: params.ip || null,
      },
    });
  } catch (error) {
    console.error('Failed to write log:', error);
  }
}
