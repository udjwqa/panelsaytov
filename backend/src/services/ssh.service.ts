import { NodeSSH } from 'node-ssh';
import { decrypt } from '../utils/crypto';

interface SSHConnectionParams {
  ip: string;
  port: number;
  username: string;
  authType: 'PASSWORD' | 'KEY';
  password?: string | null;
  privateKey?: string | null;
}

export async function createSSHConnection(params: SSHConnectionParams): Promise<NodeSSH> {
  const ssh = new NodeSSH();

  const config: any = {
    host: params.ip,
    port: params.port,
    username: params.username,
    readyTimeout: 10000,
  };

  if (params.authType === 'PASSWORD' && params.password) {
    config.password = decrypt(params.password);
  } else if (params.authType === 'KEY' && params.privateKey) {
    config.privateKey = decrypt(params.privateKey);
  }

  await ssh.connect(config);
  return ssh;
}

export async function testSSHConnection(params: SSHConnectionParams): Promise<{ success: boolean; error?: string }> {
  try {
    const ssh = await createSSHConnection(params);
    await ssh.execCommand('echo ok');
    ssh.dispose();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'SSH connection failed' };
  }
}

export async function pingServer(ip: string): Promise<{ success: boolean; timeMs?: number }> {
  const { exec } = await import('child_process');
  return new Promise((resolve) => {
    const start = Date.now();
    exec(`ping -c 1 -W 5 ${ip}`, (error) => {
      if (error) {
        resolve({ success: false });
      } else {
        resolve({ success: true, timeMs: Date.now() - start });
      }
    });
  });
}

export async function getServerStats(params: SSHConnectionParams): Promise<{
  cpu: number | null;
  ram: number | null;
  disk: number | null;
}> {
  try {
    const ssh = await createSSHConnection(params);

    const cpuResult = await ssh.execCommand("top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1");
    const ramResult = await ssh.execCommand("free | awk '/Mem:/ {printf \"%.1f\", $3/$2 * 100}'");
    const diskResult = await ssh.execCommand("df -h / | awk 'NR==2 {print $5}' | tr -d '%'");

    ssh.dispose();

    return {
      cpu: cpuResult.stdout ? parseFloat(cpuResult.stdout) : null,
      ram: ramResult.stdout ? parseFloat(ramResult.stdout) : null,
      disk: diskResult.stdout ? parseFloat(diskResult.stdout) : null,
    };
  } catch {
    return { cpu: null, ram: null, disk: null };
  }
}
