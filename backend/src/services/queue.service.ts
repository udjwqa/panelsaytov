import { Queue, Worker } from 'bullmq';
import { env } from '../config/env';
import { runDeploy } from './deploy.service';

const connection = { url: env.REDIS_URL };

export const deployQueue = new Queue('deploy', { connection });

// Worker processes deploy jobs
const worker = new Worker(
  'deploy',
  async (job) => {
    const { deployId } = job.data;
    console.log(`[Queue] Starting deploy job: ${deployId}`);
    await runDeploy(deployId);
  },
  {
    connection,
    concurrency: 3,
  }
);

worker.on('completed', (job) => {
  console.log(`[Queue] Deploy job completed: ${job.data.deployId}`);
});

worker.on('failed', (job, err) => {
  console.error(`[Queue] Deploy job failed: ${job?.data?.deployId}`, err.message);
});

export async function addDeployJob(deployId: string) {
  await deployQueue.add('deploy', { deployId }, {
    removeOnComplete: 100,
    removeOnFail: 50,
  });
}
