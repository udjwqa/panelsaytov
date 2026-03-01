import { useQuery } from '@tanstack/react-query';
import { Globe, Server, Layout, Rocket, Clock, AlertCircle, HardDrive } from 'lucide-react';
import api from '../api/client';
import { Badge } from '../components/ui/Badge';

interface DashboardData {
  stats: {
    sites: { total: number; online: number; offline: number; deploying: number };
    servers: { total: number; online: number };
    domains: { total: number; free: number; abused: number };
    backups: { total: number; success: number };
  };
  recentDeploys: Array<{
    id: string; status: string; startedAt: string; duration: number | null;
    site: { name: string }; user: { username: string };
  }>;
  recentLogs: Array<{
    id: string; action: string; target: string; createdAt: string;
    user: { username: string } | null; site: { name: string } | null;
  }>;
}

const deployStatusConfig: Record<string, { variant: 'success' | 'danger' | 'warning' | 'info' | 'default'; label: string }> = {
  SUCCESS: { variant: 'success', label: 'Успех' },
  FAILED: { variant: 'danger', label: 'Ошибка' },
  RUNNING: { variant: 'info', label: 'Запущен' },
  PENDING: { variant: 'warning', label: 'Ожидание' },
  CANCELLED: { variant: 'default', label: 'Отменён' },
};

export function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard');
      return data as DashboardData;
    },
    refetchInterval: 10000,
  });

  if (isLoading || !data) {
    return <div className="text-text-secondary">Загрузка...</div>;
  }

  const { stats, recentDeploys, recentLogs } = data;

  return (
    <div>
      <h1 className="text-xl font-semibold text-text mb-6">Дашборд</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <StatCard
          icon={<Layout className="w-5 h-5 text-accent" />}
          title="Сайты"
          value={stats.sites.total}
          sub={`${stats.sites.online} онлайн`}
          subColor={stats.sites.online > 0 ? 'text-success' : 'text-text-secondary'}
        />
        <StatCard
          icon={<Server className="w-5 h-5 text-success" />}
          title="Серверы"
          value={stats.servers.total}
          sub={`${stats.servers.online} онлайн`}
          subColor={stats.servers.online > 0 ? 'text-success' : 'text-text-secondary'}
        />
        <StatCard
          icon={<Globe className="w-5 h-5 text-warning" />}
          title="Домены"
          value={stats.domains.total}
          sub={`${stats.domains.free} свободных`}
        />
        <StatCard
          icon={<HardDrive className="w-5 h-5 text-accent" />}
          title="Бэкапы"
          value={stats.backups?.total || 0}
          sub={`${stats.backups?.success || 0} успешных`}
        />
        <StatCard
          icon={<AlertCircle className="w-5 h-5 text-danger" />}
          title="Абузные"
          value={stats.domains.abused}
          sub="доменов"
          subColor="text-danger"
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Recent Deploys */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-medium text-text flex items-center gap-2">
              <Rocket className="w-4 h-4" /> Последние деплои
            </h2>
          </div>
          {recentDeploys.length === 0 ? (
            <div className="px-4 py-8 text-center text-text-secondary text-sm">Нет деплоев</div>
          ) : (
            <div className="divide-y divide-border">
              {recentDeploys.map(deploy => {
                const config = deployStatusConfig[deploy.status] || deployStatusConfig.PENDING;
                return (
                  <div key={deploy.id} className="px-4 py-2.5 flex items-center justify-between">
                    <div>
                      <span className="text-text text-sm font-medium">{deploy.site.name}</span>
                      <span className="text-text-secondary text-xs ml-2">by {deploy.user.username}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {deploy.duration && (
                        <span className="text-text-secondary text-xs">{deploy.duration}с</span>
                      )}
                      <Badge variant={config.variant}>{config.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-medium text-text flex items-center gap-2">
              <Clock className="w-4 h-4" /> Последние действия
            </h2>
          </div>
          {recentLogs.length === 0 ? (
            <div className="px-4 py-8 text-center text-text-secondary text-sm">Нет действий</div>
          ) : (
            <div className="divide-y divide-border">
              {recentLogs.map(log => (
                <div key={log.id} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-accent">{log.user?.username || 'system'}</span>
                    <span className="text-text-secondary mx-1">{'\u2192'}</span>
                    <span className="text-text">{log.action}</span>
                    {log.target && <span className="text-text-secondary ml-1">({log.target})</span>}
                  </div>
                  <span className="text-text-secondary text-xs">
                    {new Date(log.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, title, value, sub, subColor = 'text-text-secondary' }: {
  icon: React.ReactNode; title: string; value: number; sub: string; subColor?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-3 mb-2">
        {icon}
        <span className="text-sm text-text-secondary">{title}</span>
      </div>
      <div className="text-2xl font-semibold text-text">{value}</div>
      <div className={`text-xs mt-1 ${subColor}`}>{sub}</div>
    </div>
  );
}
