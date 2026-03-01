import { prisma } from '../config/database';
import https from 'https';
import http from 'http';

interface CheckResult {
  status: number | null;
  responseTime: number | null;
  isUp: boolean;
}

// Check single site HTTP status
async function checkSiteHttp(domain: string): Promise<CheckResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const url = `https://${domain}`;

    const req = https.get(url, { timeout: 10000, rejectUnauthorized: false }, (res) => {
      const responseTime = Date.now() - start;
      resolve({
        status: res.statusCode || null,
        responseTime,
        isUp: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 500,
      });
      res.resume();
    });

    req.on('error', () => {
      // Fallback to HTTP
      const reqHttp = http.get(`http://${domain}`, { timeout: 10000 }, (res) => {
        const responseTime = Date.now() - start;
        resolve({
          status: res.statusCode || null,
          responseTime,
          isUp: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 500,
        });
        res.resume();
      });
      reqHttp.on('error', () => {
        resolve({ status: null, responseTime: null, isUp: false });
      });
      reqHttp.setTimeout(10000, () => { reqHttp.destroy(); resolve({ status: null, responseTime: null, isUp: false }); });
    });

    req.setTimeout(10000, () => { req.destroy(); resolve({ status: null, responseTime: null, isUp: false }); });
  });
}

// Run monitoring checks for all active sites with domains
export async function runMonitoringCheck() {
  const sites = await prisma.site.findMany({
    where: {
      domain: { isNot: null },
      status: { not: 'DEPLOYING' },
    },
    include: { domain: true },
  }) as any[];

  console.log(`[Monitoring] Checking ${sites.length} sites...`);

  for (const site of sites) {
    if (!site.domain?.domain) continue;

    const result = await checkSiteHttp(site.domain.domain);

    await prisma.site.update({
      where: { id: site.id },
      data: {
        httpStatus: result.status,
        responseTime: result.responseTime,
        lastCheckAt: new Date(),
        status: result.isUp ? 'ONLINE' : 'OFFLINE',
      },
    });
  }

  console.log(`[Monitoring] Check complete`);
}

// Check auto-rotation: if a site has autoRotation enabled and domain is older than autoRotateAfter days
export async function checkAutoRotation() {
  const sites = await prisma.site.findMany({
    where: {
      autoRotation: true,
      domain: { isNot: null },
    },
    include: {
      domain: true,
      spareDomains: true,
    },
  }) as any[];

  for (const site of sites) {
    if (!site.domain) continue;

    const domainAge = (Date.now() - new Date(site.domain.updatedAt).getTime()) / (1000 * 60 * 60 * 24);

    if (domainAge >= site.autoRotateAfter) {
      const spareDomain = site.spareDomains.find((d: any) => d.status === 'FREE');
      if (!spareDomain) continue;

      console.log(`[AutoRotation] Rotating ${site.name}: ${site.domain.domain} → ${spareDomain.domain}`);

      // Free old domain
      await prisma.domain.update({
        where: { id: site.domain.id },
        data: { status: 'FREE' },
      });

      // Set new domain
      await prisma.site.update({
        where: { id: site.id },
        data: { domainId: spareDomain.id },
      });

      await prisma.domain.update({
        where: { id: spareDomain.id },
        data: { status: 'ACTIVE' },
      });
    }
  }
}

// Start monitoring interval (every 60 seconds)
let monitoringInterval: NodeJS.Timeout | null = null;

export function startMonitoring() {
  if (monitoringInterval) return;
  console.log('[Monitoring] Started (interval: 60s)');

  // Run immediately
  runMonitoringCheck().catch(console.error);

  monitoringInterval = setInterval(() => {
    runMonitoringCheck().catch(console.error);
  }, 60_000);

  // Auto-rotation check every hour
  setInterval(() => {
    checkAutoRotation().catch(console.error);
  }, 3600_000);
}

export function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    console.log('[Monitoring] Stopped');
  }
}
