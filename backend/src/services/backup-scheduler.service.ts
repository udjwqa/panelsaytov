import { Queue, Worker } from 'bullmq';
import { env } from '../config/env';
import { runBackup, runScheduledBackups, getBackupSettings } from './backup.service';

const connection = { url: env.REDIS_URL };

export const backupQueue = new Queue('backup', { connection });

// Worker processes backup jobs
const worker = new Worker(
  'backup',
  async (job) => {
    if (job.name === 'scheduled-backup') {
      console.log('[Backup] Running scheduled backups...');
      await runScheduledBackups();
    } else if (job.name === 'manual-backup') {
      const { backupId } = job.data;
      console.log(`[Backup] Running manual backup: ${backupId}`);
      await runBackup(backupId);
    }
  },
  {
    connection,
    concurrency: 1,
  }
);

worker.on('completed', (job) => {
  console.log(`[Backup] Job completed: ${job.name}`);
});

worker.on('failed', (job, err) => {
  console.error(`[Backup] Job failed: ${job?.name}`, err.message);
});

/**
 * Schedule a nightly backup using BullMQ repeatable job
 */
export async function setupBackupSchedule(): Promise<void> {
  const settings = await getBackupSettings();

  // Remove existing repeatable jobs
  const repeatable = await backupQueue.getRepeatableJobs();
  for (const job of repeatable) {
    await backupQueue.removeRepeatableByKey(job.key);
  }

  if (settings.enabled) {
    await backupQueue.add(
      'scheduled-backup',
      {},
      {
        repeat: { pattern: settings.cronTime },
        removeOnComplete: 10,
        removeOnFail: 10,
      }
    );
    console.log(`[Backup] Scheduled at cron: ${settings.cronTime}`);
  } else {
    console.log('[Backup] Auto-backup is disabled');
  }
}

/**
 * Add a manual backup job to the queue
 */
export async function addManualBackupJob(backupId: string): Promise<void> {
  await backupQueue.add('manual-backup', { backupId }, {
    removeOnComplete: 50,
    removeOnFail: 20,
  });
}
