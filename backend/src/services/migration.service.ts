import { prisma } from '../config/database';
import { createSSHConnection } from './ssh.service';
import { setDnsRecord } from './cloudflare.service';
import { runDeploy } from './deploy.service';
import { io } from '../index';

// Migrate a site from one server to another
export async function migrateSite(
  siteId: string,
  targetServerId: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: { server: true, domain: true },
  }) as any;

  if (!site) return { success: false, error: 'Сайт не найден' };

  const targetServer = await prisma.server.findUnique({ where: { id: targetServerId } });
  if (!targetServer) return { success: false, error: 'Целевой сервер не найден' };

  try {
    // Step 1: Create deploy on new server
    const deploy = await prisma.deploy.create({
      data: {
        siteId,
        userId,
        serverId: targetServerId,
        domainId: site.domainId,
        status: 'PENDING',
      },
    });

    // Step 2: Update site's server reference
    await prisma.site.update({
      where: { id: siteId },
      data: { serverId: targetServerId, status: 'DEPLOYING' },
    });

    // Step 3: Run deploy on new server
    await runDeploy(deploy.id);

    // Step 4: Update DNS if domain has Cloudflare
    if (site.domain?.cloudflareZone && site.domain?.cloudflareToken) {
      await setDnsRecord(
        { zoneId: site.domain.cloudflareZone, apiToken: site.domain.cloudflareToken },
        site.domain.domain,
        targetServer.ip,
      );
    }

    return { success: true };
  } catch (error: any) {
    // Rollback server reference on failure
    await prisma.site.update({
      where: { id: siteId },
      data: { serverId: site.serverId, status: 'ERROR' },
    });
    return { success: false, error: error.message };
  }
}

// Panic button: switch ALL active sites to spare domains/servers
export async function panicSwitch(userId: string): Promise<{ switched: number; errors: string[] }> {
  const sites = await prisma.site.findMany({
    where: { status: { in: ['ONLINE', 'DEPLOYING', 'UNKNOWN'] } },
    include: {
      domain: true,
      spareDomains: true,
      server: true,
    },
  }) as any[];

  let switched = 0;
  const errors: string[] = [];

  for (const site of sites) {
    try {
      // Try to switch to a spare domain
      if (site.spareDomains.length > 0) {
        const spareDomain = site.spareDomains.find((d: any) => d.status === 'FREE');
        if (spareDomain) {
          // Free old domain
          if (site.domainId) {
            await prisma.domain.update({
              where: { id: site.domainId },
              data: { status: 'ABUSED' },
            });
          }

          // Set new domain
          await prisma.site.update({
            where: { id: site.id },
            data: { domainId: spareDomain.id },
          });

          await prisma.domain.update({
            where: { id: spareDomain.id },
            data: { status: 'ACTIVE' },
          });

          // Update DNS via Cloudflare if available
          if (spareDomain.cloudflareZone && spareDomain.cloudflareToken) {
            await setDnsRecord(
              { zoneId: spareDomain.cloudflareZone, apiToken: spareDomain.cloudflareToken },
              spareDomain.domain,
              site.server.ip,
            );
          }

          switched++;
        }
      }
    } catch (error: any) {
      errors.push(`${site.name}: ${error.message}`);
    }
  }

  io.emit('panic:executed', { switched, errors, timestamp: new Date() });

  return { switched, errors };
}
