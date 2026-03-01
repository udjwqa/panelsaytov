import { prisma } from '../config/database';
import { createSSHConnection } from './ssh.service';
import { logAction } from './log.service';
import { io } from '../index';

interface PropagationResult {
  propagated: number;
  failed: number;
  errors: Array<{ siteId: string; siteName: string; error: string }>;
  details: Array<{ siteId: string; siteName: string; status: 'ok' | 'failed' }>;
}

export async function propagatePaymentUrl(
  gatewayId: string,
  newUrl: string,
  userId: string,
  onlyFailed = false,
): Promise<PropagationResult> {
  const result: PropagationResult = { propagated: 0, failed: 0, errors: [], details: [] };

  const gateway = await prisma.paymentGateway.findUnique({
    where: { id: gatewayId },
    include: {
      linkedSites: {
        where: onlyFailed ? { lastPropagateOk: false } : {},
        include: {
          site: {
            include: {
              server: true,
              domain: true,
            },
          },
        },
      },
    },
  });

  if (!gateway) return result;

  for (const link of gateway.linkedSites) {
    const { site } = link;
    try {
      const ssh = await createSSHConnection({
        ip: site.server.ip,
        port: site.server.sshPort,
        username: site.server.sshUser,
        authType: site.server.sshAuthType as 'PASSWORD' | 'KEY',
        password: site.server.sshPassword,
        privateKey: site.server.sshKey,
      });

      try {
        // Read existing .env
        const envResult = await ssh.execCommand(`cat ${site.deployPath}/.env 2>/dev/null || echo ""`);
        let envContent = envResult.stdout || '';

        // Replace or add the env var
        const envVarName = link.envVarName || 'PAYMENT_URL';
        const regex = new RegExp(`^${envVarName}=.*$`, 'm');

        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${envVarName}=${newUrl}`);
        } else {
          envContent = envContent.trimEnd() + `\n${envVarName}=${newUrl}\n`;
        }

        // Write .env back using base64 to avoid escaping issues
        const b64 = Buffer.from(envContent).toString('base64');
        await ssh.execCommand(`echo "${b64}" | base64 -d > ${site.deployPath}/.env`);

        // Restart the service - try pm2 first, then systemd
        const pm2Check = await ssh.execCommand(`pm2 list 2>/dev/null | grep -c "online\\|stopped" || echo "0"`);
        const hasPm2 = parseInt(pm2Check.stdout.trim()) > 0;

        if (hasPm2) {
          await ssh.execCommand(`cd ${site.deployPath} && pm2 restart all 2>/dev/null || true`);
        } else {
          // Try systemd with domain-based name
          const serviceName = site.domain?.domain?.replace(/\./g, '-') || `site-${site.id.slice(0, 8)}`;
          await ssh.execCommand(`systemctl restart ${serviceName} 2>/dev/null || true`);
        }

        // Update link record
        await prisma.sitePaymentGateway.update({
          where: { id: link.id },
          data: { lastPropagatedAt: new Date(), lastPropagateOk: true },
        });

        result.propagated++;
        result.details.push({ siteId: site.id, siteName: site.name, status: 'ok' });
      } finally {
        ssh.dispose();
      }
    } catch (error: any) {
      result.failed++;
      result.errors.push({
        siteId: site.id,
        siteName: site.name,
        error: error.message,
      });
      result.details.push({ siteId: site.id, siteName: site.name, status: 'failed' });

      await prisma.sitePaymentGateway.update({
        where: { id: link.id },
        data: { lastPropagatedAt: new Date(), lastPropagateOk: false },
      }).catch(() => {});
    }
  }

  // Emit Socket.IO event for real-time UI
  io.emit('payment:propagation', {
    gatewayId: gateway.id,
    gatewayName: gateway.name,
    result,
    timestamp: new Date(),
  });

  await logAction({
    userId,
    action: 'payment_switch_url',
    target: gateway.name,
    details: { newUrl, propagated: result.propagated, failed: result.failed, errors: result.errors },
  });

  return result;
}
