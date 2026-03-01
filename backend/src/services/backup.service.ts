import { prisma } from '../config/database';
import { createSSHConnection } from './ssh.service';
import { NodeSSH } from 'node-ssh';
import path from 'path';
import fs from 'fs/promises';
import { env } from '../config/env';

const BACKUP_DIR = process.env.BACKUP_DIR || path.resolve(__dirname, '../../../backups');

// Ensure backup directory exists
async function ensureBackupDir(): Promise<void> {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

interface BackupResult {
  filePath: string;
  fileSize: bigint;
  dbIncluded: boolean;
  dbType: string | null;
}

/**
 * Detect what database a site uses by checking common config files
 */
async function detectDatabase(ssh: NodeSSH, deployPath: string): Promise<{ type: 'mysql' | 'postgresql' | null; name?: string; user?: string; password?: string; host?: string }> {
  // Check for .env file (Laravel, Node.js, Django, etc.)
  const envResult = await ssh.execCommand(`cat ${deployPath}/.env 2>/dev/null`);
  if (envResult.stdout) {
    const envContent = envResult.stdout;

    // MySQL detection
    const mysqlMatch = envContent.match(/DB_CONNECTION=mysql/);
    if (mysqlMatch) {
      const dbName = envContent.match(/DB_DATABASE=(\S+)/)?.[1];
      const dbUser = envContent.match(/DB_USERNAME=(\S+)/)?.[1];
      const dbPass = envContent.match(/DB_PASSWORD=(\S+)/)?.[1];
      const dbHost = envContent.match(/DB_HOST=(\S+)/)?.[1] || 'localhost';
      return { type: 'mysql', name: dbName, user: dbUser, password: dbPass, host: dbHost };
    }

    // PostgreSQL detection
    const pgMatch = envContent.match(/DB_CONNECTION=pgsql/) || envContent.match(/DATABASE_URL=postgres/);
    if (pgMatch) {
      const dbName = envContent.match(/DB_DATABASE=(\S+)/)?.[1];
      const dbUser = envContent.match(/DB_USERNAME=(\S+)/)?.[1];
      const dbPass = envContent.match(/DB_PASSWORD=(\S+)/)?.[1];
      const dbHost = envContent.match(/DB_HOST=(\S+)/)?.[1] || 'localhost';
      return { type: 'postgresql', name: dbName, user: dbUser, password: dbPass, host: dbHost };
    }
  }

  // Check for wp-config.php (WordPress)
  const wpResult = await ssh.execCommand(`cat ${deployPath}/wp-config.php 2>/dev/null`);
  if (wpResult.stdout) {
    const dbName = wpResult.stdout.match(/define\(\s*'DB_NAME'\s*,\s*'([^']+)'/)?.[1];
    const dbUser = wpResult.stdout.match(/define\(\s*'DB_USER'\s*,\s*'([^']+)'/)?.[1];
    const dbPass = wpResult.stdout.match(/define\(\s*'DB_PASSWORD'\s*,\s*'([^']+)'/)?.[1];
    const dbHost = wpResult.stdout.match(/define\(\s*'DB_HOST'\s*,\s*'([^']+)'/)?.[1] || 'localhost';
    return { type: 'mysql', name: dbName, user: dbUser, password: dbPass, host: dbHost };
  }

  return { type: null };
}

/**
 * Run a full backup of a site: files + optional DB dump
 */
export async function runBackup(backupId: string): Promise<void> {
  const backup = await prisma.backup.findUnique({
    where: { id: backupId },
    include: { site: { include: { server: true } } },
  });

  if (!backup) throw new Error(`Backup ${backupId} not found`);

  const site = backup.site as any;
  const server = site.server;

  await prisma.backup.update({
    where: { id: backupId },
    data: { status: 'RUNNING' },
  });

  let ssh: NodeSSH | null = null;

  try {
    ssh = await createSSHConnection({
      ip: server.ip,
      port: server.sshPort,
      username: server.sshUser,
      authType: server.sshAuthType,
      password: server.sshPassword,
      privateKey: server.sshKey,
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const remoteBackupName = `backup-${site.name}-${timestamp}`;
    const remoteTmpDir = `/tmp/${remoteBackupName}`;

    // Create temp directory on server
    await ssh.execCommand(`mkdir -p ${remoteTmpDir}`);

    // Detect and dump database
    const db = await detectDatabase(ssh, site.deployPath);
    let dbIncluded = false;
    let dbType: string | null = null;

    if (db.type === 'mysql' && db.name) {
      const passFlag = db.password ? `-p'${db.password}'` : '';
      const dumpCmd = `mysqldump -h ${db.host} -u ${db.user} ${passFlag} ${db.name} > ${remoteTmpDir}/database.sql 2>/dev/null`;
      const dumpResult = await ssh.execCommand(dumpCmd);
      if (dumpResult.code === 0) {
        dbIncluded = true;
        dbType = 'mysql';
      }
    } else if (db.type === 'postgresql' && db.name) {
      const pgEnv = db.password ? `PGPASSWORD='${db.password}'` : '';
      const dumpCmd = `${pgEnv} pg_dump -h ${db.host || 'localhost'} -U ${db.user} ${db.name} > ${remoteTmpDir}/database.sql 2>/dev/null`;
      const dumpResult = await ssh.execCommand(dumpCmd);
      if (dumpResult.code === 0) {
        dbIncluded = true;
        dbType = 'postgresql';
      }
    }

    // Archive site files
    await ssh.execCommand(
      `tar -czf ${remoteTmpDir}/files.tar.gz -C ${path.dirname(site.deployPath)} ${path.basename(site.deployPath)} 2>/dev/null`
    );

    // Create final archive
    const remoteArchive = `/tmp/${remoteBackupName}.tar.gz`;
    await ssh.execCommand(`tar -czf ${remoteArchive} -C /tmp ${remoteBackupName}`);

    // Download to local
    await ensureBackupDir();
    const localPath = path.join(BACKUP_DIR, `${remoteBackupName}.tar.gz`);
    await ssh.getFile(localPath, remoteArchive);

    // Get file size
    const stat = await fs.stat(localPath);

    // Clean up remote temp files
    await ssh.execCommand(`rm -rf ${remoteTmpDir} ${remoteArchive}`);

    // Calculate expiry (default 30 days)
    const settings = await getBackupSettings();
    const retentionDays = settings.retentionDays || 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + retentionDays);

    await prisma.backup.update({
      where: { id: backupId },
      data: {
        status: 'SUCCESS',
        filePath: localPath,
        fileSize: BigInt(stat.size),
        dbIncluded,
        dbType,
        completedAt: new Date(),
        expiresAt,
      },
    });

    // Rotate old backups
    await rotateBackups(site.id);

    ssh.dispose();
  } catch (error: any) {
    if (ssh) ssh.dispose();
    await prisma.backup.update({
      where: { id: backupId },
      data: {
        status: 'FAILED',
        error: error.message || 'Backup failed',
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

/**
 * Restore a backup to a server (same or different)
 */
export async function restoreBackup(backupId: string, targetServerId?: string): Promise<void> {
  const backup = await prisma.backup.findUnique({
    where: { id: backupId },
    include: { site: { include: { server: true } } },
  });

  if (!backup) throw new Error('Backup not found');
  if (backup.status !== 'SUCCESS') throw new Error('Backup is not in SUCCESS status');
  if (!backup.filePath) throw new Error('Backup file path is missing');

  const site = backup.site as any;

  // Use target server or original server
  let server = site.server;
  if (targetServerId && targetServerId !== server.id) {
    const targetServer = await prisma.server.findUnique({ where: { id: targetServerId } });
    if (!targetServer) throw new Error('Target server not found');
    server = targetServer;
  }

  const ssh = await createSSHConnection({
    ip: server.ip,
    port: server.sshPort,
    username: server.sshUser,
    authType: server.sshAuthType,
    password: server.sshPassword,
    privateKey: server.sshKey,
  });

  try {
    const remoteTmpPath = `/tmp/restore-${backup.id}.tar.gz`;

    // Upload backup to server
    await ssh.putFile(backup.filePath, remoteTmpPath);

    // Extract
    const extractDir = `/tmp/restore-${backup.id}`;
    await ssh.execCommand(`mkdir -p ${extractDir} && tar -xzf ${remoteTmpPath} -C ${extractDir}`);

    // Find the inner backup directory
    const lsResult = await ssh.execCommand(`ls ${extractDir}`);
    const backupDir = lsResult.stdout.trim().split('\n')[0];
    const innerDir = `${extractDir}/${backupDir}`;

    // Restore files
    const siteBaseName = path.basename(site.deployPath);
    await ssh.execCommand(`rm -rf ${site.deployPath}`);
    await ssh.execCommand(
      `tar -xzf ${innerDir}/files.tar.gz -C ${path.dirname(site.deployPath)}`
    );

    // Restore database if included
    if (backup.dbIncluded && backup.dbType) {
      const db = await detectDatabase(ssh, site.deployPath);
      if (db.type === 'mysql' && db.name) {
        const passFlag = db.password ? `-p'${db.password}'` : '';
        await ssh.execCommand(
          `mysql -h ${db.host} -u ${db.user} ${passFlag} ${db.name} < ${innerDir}/database.sql`
        );
      } else if (db.type === 'postgresql' && db.name) {
        const pgEnv = db.password ? `PGPASSWORD='${db.password}'` : '';
        await ssh.execCommand(
          `${pgEnv} psql -h ${db.host || 'localhost'} -U ${db.user} ${db.name} < ${innerDir}/database.sql`
        );
      }
    }

    // Cleanup
    await ssh.execCommand(`rm -rf ${extractDir} ${remoteTmpPath}`);

    ssh.dispose();
  } catch (error) {
    ssh.dispose();
    throw error;
  }
}

/**
 * Rotate backups: keep only maxBackupsPerSite most recent
 */
async function rotateBackups(siteId: string): Promise<void> {
  const settings = await getBackupSettings();
  const maxBackups = settings.maxPerSite || 10;

  const backups = await prisma.backup.findMany({
    where: { siteId, status: 'SUCCESS' },
    orderBy: { createdAt: 'desc' },
    skip: maxBackups,
  });

  for (const backup of backups) {
    if (backup.filePath) {
      try {
        await fs.unlink(backup.filePath);
      } catch {
        // File may already be deleted
      }
    }
    await prisma.backup.delete({ where: { id: backup.id } });
  }
}

/**
 * Delete expired backups
 */
export async function cleanupExpiredBackups(): Promise<number> {
  const expired = await prisma.backup.findMany({
    where: {
      expiresAt: { lte: new Date() },
      status: 'SUCCESS',
    },
  });

  for (const backup of expired) {
    if (backup.filePath) {
      try {
        await fs.unlink(backup.filePath);
      } catch {
        // File may already be deleted
      }
    }
    await prisma.backup.delete({ where: { id: backup.id } });
  }

  return expired.length;
}

/**
 * Create backup for all sites with autoBackup enabled (or all sites if global setting is on)
 */
export async function runScheduledBackups(): Promise<void> {
  const settings = await getBackupSettings();
  if (!settings.enabled) return;

  const sites = await prisma.site.findMany({
    where: { status: { not: 'UNKNOWN' } },
    select: { id: true, serverId: true },
  });

  for (const site of sites) {
    const backup = await prisma.backup.create({
      data: {
        siteId: site.id,
        serverId: site.serverId,
        type: 'AUTO',
        status: 'PENDING',
      },
    });

    try {
      await runBackup(backup.id);
    } catch (error) {
      console.error(`[Backup] Auto backup failed for site ${site.id}:`, error);
    }
  }

  // Cleanup expired
  const cleaned = await cleanupExpiredBackups();
  if (cleaned > 0) {
    console.log(`[Backup] Cleaned up ${cleaned} expired backups`);
  }
}

/**
 * Get backup settings from DB
 */
export async function getBackupSettings(): Promise<{
  enabled: boolean;
  cronTime: string;
  retentionDays: number;
  maxPerSite: number;
}> {
  const setting = await prisma.setting.findUnique({
    where: { key: 'backup_settings' },
  });

  if (setting) {
    return setting.value as any;
  }

  return {
    enabled: false,
    cronTime: '0 3 * * *',
    retentionDays: 30,
    maxPerSite: 10,
  };
}

/**
 * Update backup settings
 */
export async function updateBackupSettings(settings: {
  enabled?: boolean;
  cronTime?: string;
  retentionDays?: number;
  maxPerSite?: number;
}): Promise<void> {
  const current = await getBackupSettings();
  const updated = { ...current, ...settings };

  await prisma.setting.upsert({
    where: { key: 'backup_settings' },
    create: { key: 'backup_settings', value: updated as any },
    update: { value: updated as any },
  });
}
