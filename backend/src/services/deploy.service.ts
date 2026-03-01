import { NodeSSH } from 'node-ssh';
import { prisma } from '../config/database';
import { createSSHConnection } from './ssh.service';
import { io } from '../index';

interface DeployContext {
  deployId: string;
  siteId: string;
  ssh: NodeSSH;
  deployPath: string;
  domain: string | null;
  port: number;
  stack: string;
  repoUrl: string | null;
  branch: string;
  sourceType: string;
  customScript: string | null;
  envVars: Record<string, string> | null;
  withSsl: boolean;
  logs: string[];
}

function emitLog(ctx: DeployContext, message: string) {
  const timestamp = new Date().toISOString().slice(11, 19);
  const line = `[${timestamp}] ${message}`;
  ctx.logs.push(line);
  io.to(`deploy:${ctx.deployId}`).emit('deploy:log', { deployId: ctx.deployId, line });
}

async function exec(ctx: DeployContext, command: string, cwd?: string): Promise<string> {
  emitLog(ctx, `$ ${command}`);
  const result = await ctx.ssh.execCommand(command, { cwd: cwd || ctx.deployPath });
  if (result.stdout) {
    result.stdout.split('\n').forEach(line => emitLog(ctx, line));
  }
  if (result.stderr) {
    result.stderr.split('\n').forEach(line => emitLog(ctx, `[stderr] ${line}`));
  }
  if (result.code !== 0 && result.code !== null) {
    throw new Error(`Command failed with code ${result.code}: ${command}`);
  }
  return result.stdout;
}

// Auto-detect stack by checking files on the server
export async function detectStack(ssh: NodeSSH, deployPath: string): Promise<string> {
  const check = async (file: string) => {
    const result = await ssh.execCommand(`test -f ${deployPath}/${file} && echo "yes" || echo "no"`);
    return result.stdout.trim() === 'yes';
  };

  if (await check('Dockerfile')) return 'DOCKER';
  if (await check('composer.json')) {
    const artisan = await check('artisan');
    if (artisan) return 'PHP_LARAVEL';
    const wpConfig = await check('wp-config.php') || await check('wp-config-sample.php');
    if (wpConfig) return 'PHP_WORDPRESS';
    return 'PHP_LARAVEL'; // default PHP
  }
  if (await check('package.json')) return 'NODEJS';
  if (await check('requirements.txt') || await check('Pipfile')) {
    const manage = await check('manage.py');
    if (manage) return 'PYTHON_DJANGO';
    return 'PYTHON_FASTAPI';
  }
  if (await check('index.html')) return 'STATIC';
  return 'STATIC';
}

// Generate nginx config for a site
function generateNginxConfig(domain: string, port: number, stack: string, deployPath: string): string {
  const isProxy = ['NODEJS', 'PYTHON_DJANGO', 'PYTHON_FASTAPI', 'DOCKER'].includes(stack);

  if (isProxy) {
    return `server {
    listen 80;
    server_name ${domain};

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}`;
  }

  // PHP or static
  const root = stack === 'PHP_LARAVEL' ? `${deployPath}/public` : deployPath;
  const phpBlock = ['PHP_LARAVEL', 'PHP_WORDPRESS'].includes(stack) ? `
    location ~ \\.php$ {
        fastcgi_pass unix:/var/run/php/php-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }` : '';

  return `server {
    listen 80;
    server_name ${domain};
    root ${root};
    index index.php index.html;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }${phpBlock}

    location ~ /\\.(?!well-known).* {
        deny all;
    }
}`;
}

// Build commands per stack
async function runBuild(ctx: DeployContext) {
  const { stack, deployPath } = ctx;

  switch (stack) {
    case 'NODEJS':
      emitLog(ctx, '--- Installing Node.js dependencies ---');
      // Check for package-lock.json or yarn.lock
      const hasYarn = (await ctx.ssh.execCommand(`test -f ${deployPath}/yarn.lock && echo yes || echo no`)).stdout.trim() === 'yes';
      const hasPnpm = (await ctx.ssh.execCommand(`test -f ${deployPath}/pnpm-lock.yaml && echo yes || echo no`)).stdout.trim() === 'yes';

      if (hasPnpm) {
        await exec(ctx, 'pnpm install --frozen-lockfile');
      } else if (hasYarn) {
        await exec(ctx, 'yarn install --frozen-lockfile');
      } else {
        await exec(ctx, 'npm ci || npm install');
      }

      // Check if there's a build script
      const pkgJson = (await ctx.ssh.execCommand(`cat ${deployPath}/package.json`)).stdout;
      try {
        const pkg = JSON.parse(pkgJson);
        if (pkg.scripts?.build) {
          emitLog(ctx, '--- Building ---');
          await exec(ctx, 'npm run build');
        }
      } catch {}
      break;

    case 'PHP_LARAVEL':
      emitLog(ctx, '--- Installing PHP dependencies ---');
      await exec(ctx, 'composer install --no-dev --optimize-autoloader');
      await exec(ctx, 'php artisan migrate --force');
      await exec(ctx, 'php artisan config:cache');
      await exec(ctx, 'php artisan route:cache');
      await exec(ctx, 'php artisan view:cache');
      break;

    case 'PHP_WORDPRESS':
      emitLog(ctx, '--- WordPress setup ---');
      const hasComposer = (await ctx.ssh.execCommand(`test -f ${deployPath}/composer.json && echo yes || echo no`)).stdout.trim() === 'yes';
      if (hasComposer) {
        await exec(ctx, 'composer install --no-dev');
      }
      await exec(ctx, `chown -R www-data:www-data ${deployPath}`);
      break;

    case 'PYTHON_DJANGO':
      emitLog(ctx, '--- Setting up Python environment ---');
      await exec(ctx, `cd ${deployPath} && python3 -m venv venv`);
      await exec(ctx, `${deployPath}/venv/bin/pip install -r requirements.txt`);
      await exec(ctx, `${deployPath}/venv/bin/python manage.py migrate --noinput`);
      await exec(ctx, `${deployPath}/venv/bin/python manage.py collectstatic --noinput`);
      break;

    case 'PYTHON_FASTAPI':
      emitLog(ctx, '--- Setting up Python environment ---');
      await exec(ctx, `cd ${deployPath} && python3 -m venv venv`);
      await exec(ctx, `${deployPath}/venv/bin/pip install -r requirements.txt`);
      break;

    case 'DOCKER':
      emitLog(ctx, '--- Building Docker container ---');
      await exec(ctx, 'docker compose build || docker-compose build');
      await exec(ctx, 'docker compose up -d || docker-compose up -d');
      break;

    case 'STATIC':
      emitLog(ctx, '--- Static site, no build needed ---');
      break;
  }
}

// Create systemd service for process management
async function setupProcessManager(ctx: DeployContext) {
  const { stack, deployPath, port, domain } = ctx;
  const serviceName = domain?.replace(/\./g, '-') || `site-${ctx.siteId.slice(0, 8)}`;

  if (stack === 'NODEJS') {
    // Check for start script
    const pkgJson = (await ctx.ssh.execCommand(`cat ${deployPath}/package.json`)).stdout;
    let startCmd = `node index.js`;
    try {
      const pkg = JSON.parse(pkgJson);
      if (pkg.scripts?.start) startCmd = 'npm start';
      if (pkg.main) startCmd = `node ${pkg.main}`;
    } catch {}

    const service = `[Unit]
Description=${serviceName}
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=${deployPath}
ExecStart=/usr/bin/env PORT=${port} ${startCmd}
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=${port}

[Install]
WantedBy=multi-user.target`;

    emitLog(ctx, `--- Setting up systemd service: ${serviceName} ---`);
    await exec(ctx, `echo '${service.replace(/'/g, "'\\''")}' | sudo tee /etc/systemd/system/${serviceName}.service`, '/tmp');
    await exec(ctx, `sudo systemctl daemon-reload`, '/tmp');
    await exec(ctx, `sudo systemctl enable ${serviceName}`, '/tmp');
    await exec(ctx, `sudo systemctl restart ${serviceName}`, '/tmp');
  }

  if (stack === 'PYTHON_DJANGO') {
    const service = `[Unit]
Description=${serviceName}
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=${deployPath}
ExecStart=${deployPath}/venv/bin/gunicorn --bind 127.0.0.1:${port} --workers 3 config.wsgi:application
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target`;

    emitLog(ctx, `--- Setting up systemd service: ${serviceName} ---`);
    await exec(ctx, `echo '${service.replace(/'/g, "'\\''")}' | sudo tee /etc/systemd/system/${serviceName}.service`, '/tmp');
    await exec(ctx, `sudo systemctl daemon-reload`, '/tmp');
    await exec(ctx, `sudo systemctl enable ${serviceName}`, '/tmp');
    await exec(ctx, `sudo systemctl restart ${serviceName}`, '/tmp');
  }

  if (stack === 'PYTHON_FASTAPI') {
    const service = `[Unit]
Description=${serviceName}
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=${deployPath}
ExecStart=${deployPath}/venv/bin/uvicorn main:app --host 127.0.0.1 --port ${port} --workers 3
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target`;

    emitLog(ctx, `--- Setting up systemd service: ${serviceName} ---`);
    await exec(ctx, `echo '${service.replace(/'/g, "'\\''")}' | sudo tee /etc/systemd/system/${serviceName}.service`, '/tmp');
    await exec(ctx, `sudo systemctl daemon-reload`, '/tmp');
    await exec(ctx, `sudo systemctl enable ${serviceName}`, '/tmp');
    await exec(ctx, `sudo systemctl restart ${serviceName}`, '/tmp');
  }
}

// Main deploy function
export async function runDeploy(deployId: string): Promise<void> {
  const deploy = await prisma.deploy.findUnique({
    where: { id: deployId },
    include: {
      site: {
        include: {
          server: true,
          domain: true,
        },
      },
    },
  }) as any;

  if (!deploy) throw new Error('Deploy not found');

  const { site } = deploy;
  const { server } = site;

  // Mark as running
  await prisma.deploy.update({
    where: { id: deployId },
    data: { status: 'RUNNING', startedAt: new Date() },
  });

  io.to(`deploy:${deployId}`).emit('deploy:status', { deployId, status: 'RUNNING' });

  let ssh: NodeSSH | null = null;

  const ctx: DeployContext = {
    deployId,
    siteId: site.id,
    ssh: null as any,
    deployPath: site.deployPath,
    domain: site.domain?.domain || null,
    port: site.port || 3000,
    stack: site.stack,
    repoUrl: site.repoUrl,
    branch: site.branch || 'main',
    sourceType: site.sourceType,
    customScript: site.customScript,
    envVars: site.envVars as Record<string, string> | null,
    withSsl: deploy.withSsl,
    logs: [],
  };

  try {
    // Step 1: Connect to server
    emitLog(ctx, '=== Connecting to server ===');
    ssh = await createSSHConnection({
      ip: server.ip,
      port: server.sshPort,
      username: server.sshUser,
      authType: server.sshAuthType as 'PASSWORD' | 'KEY',
      password: server.sshPassword,
      privateKey: server.sshKey,
    });
    ctx.ssh = ssh;
    emitLog(ctx, `Connected to ${server.ip}`);

    // Step 2: Prepare deploy directory
    emitLog(ctx, '=== Preparing deploy directory ===');
    await exec(ctx, `mkdir -p ${site.deployPath}`, '/tmp');

    // Step 3: Get source code
    if (site.sourceType === 'GIT' && site.repoUrl) {
      emitLog(ctx, '=== Fetching source code ===');
      const gitExists = (await ssh.execCommand(`test -d ${site.deployPath}/.git && echo yes || echo no`)).stdout.trim() === 'yes';

      if (gitExists) {
        await exec(ctx, `git fetch origin && git reset --hard origin/${ctx.branch}`);
      } else {
        await exec(ctx, `git clone -b ${ctx.branch} ${site.repoUrl} ${site.deployPath}`, '/tmp');
      }
    }

    // Step 4: Auto-detect stack if needed
    if (site.stack === 'AUTO') {
      emitLog(ctx, '=== Auto-detecting stack ===');
      ctx.stack = await detectStack(ssh, site.deployPath);
      emitLog(ctx, `Detected stack: ${ctx.stack}`);
      await prisma.site.update({
        where: { id: site.id },
        data: { detectedStack: ctx.stack },
      });
    }

    // Step 5: Set env vars if any
    if (ctx.envVars && Object.keys(ctx.envVars).length > 0) {
      emitLog(ctx, '=== Writing environment variables ===');
      const envContent = Object.entries(ctx.envVars)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
      await exec(ctx, `echo '${envContent.replace(/'/g, "'\\''")}' > ${site.deployPath}/.env`, '/tmp');
    }

    // Step 6: Run custom script or standard build
    if (ctx.customScript) {
      emitLog(ctx, '=== Running custom deploy script ===');
      await exec(ctx, `echo '${ctx.customScript.replace(/'/g, "'\\''")}' > /tmp/deploy-script.sh && chmod +x /tmp/deploy-script.sh && /tmp/deploy-script.sh`, site.deployPath);
    } else {
      emitLog(ctx, '=== Building ===');
      await runBuild(ctx);
    }

    // Step 7: Setup process manager (for Node.js, Python)
    if (!ctx.customScript && !['STATIC', 'PHP_LARAVEL', 'PHP_WORDPRESS', 'DOCKER'].includes(ctx.stack)) {
      emitLog(ctx, '=== Setting up process manager ===');
      await setupProcessManager(ctx);
    }

    // Step 8: Configure nginx
    if (ctx.domain) {
      emitLog(ctx, '=== Configuring nginx ===');
      const nginxConfig = generateNginxConfig(ctx.domain, ctx.port, ctx.stack, site.deployPath);
      const confFile = `/etc/nginx/sites-available/${ctx.domain}`;
      await exec(ctx, `echo '${nginxConfig.replace(/'/g, "'\\''")}' | sudo tee ${confFile}`, '/tmp');
      await exec(ctx, `sudo ln -sf ${confFile} /etc/nginx/sites-enabled/${ctx.domain}`, '/tmp');
      await exec(ctx, `sudo nginx -t`, '/tmp');
      await exec(ctx, `sudo systemctl reload nginx`, '/tmp');
      emitLog(ctx, `Nginx configured for ${ctx.domain}`);

      // Step 9: SSL with certbot
      if (ctx.withSsl) {
        emitLog(ctx, '=== Setting up SSL ===');
        try {
          await exec(ctx, `sudo certbot --nginx -d ${ctx.domain} --non-interactive --agree-tos --register-unsafely-without-email`, '/tmp');
          emitLog(ctx, 'SSL certificate installed');
        } catch (e) {
          emitLog(ctx, `SSL setup warning: ${(e as Error).message}. Skipping SSL.`);
        }
      }
    }

    // Step 10: Set permissions
    emitLog(ctx, '=== Setting permissions ===');
    await exec(ctx, `sudo chown -R www-data:www-data ${site.deployPath}`, '/tmp');

    // Done!
    emitLog(ctx, '=== Deploy completed successfully! ===');

    const duration = Math.round((Date.now() - deploy.startedAt.getTime()) / 1000);

    await prisma.deploy.update({
      where: { id: deployId },
      data: {
        status: 'SUCCESS',
        finishedAt: new Date(),
        duration,
        log: ctx.logs.join('\n'),
      },
    });

    await prisma.site.update({
      where: { id: site.id },
      data: { status: 'ONLINE', lastDeployAt: new Date() },
    });

    io.to(`deploy:${deployId}`).emit('deploy:status', { deployId, status: 'SUCCESS', duration });
  } catch (error: any) {
    emitLog(ctx, `=== Deploy FAILED: ${error.message} ===`);

    const duration = Math.round((Date.now() - deploy.startedAt.getTime()) / 1000);

    await prisma.deploy.update({
      where: { id: deployId },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        duration,
        log: ctx.logs.join('\n'),
      },
    });

    await prisma.site.update({
      where: { id: site.id },
      data: { status: 'ERROR' },
    });

    io.to(`deploy:${deployId}`).emit('deploy:status', { deployId, status: 'FAILED', error: error.message });
  } finally {
    if (ssh) ssh.dispose();
  }
}
