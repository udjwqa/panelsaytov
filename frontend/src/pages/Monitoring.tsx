import { useQuery } from '@tanstack/react-query';
import { Activity, RefreshCw } from 'lucide-react';
import api from '../api/client';
import { StatusDot } from '../components/ui/StatusDot';
import { Badge } from '../components/ui/Badge';

interface Site {
  id: string;
  name: string;
  status: string;
  httpStatus: number | null;
  responseTime: number | null;
  lastCheckAt: string | null;
  autoRotation: boolean;
  autoRotateAfter: number;
  domain: { domain: string } | null;
  server: { name: string; ip: string } | null;
}

const statusMap: Record<string, 'online' | 'offline' | 'warning' | 'unknown'> = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  DEPLOYING: 'warning',
  ERROR: 'offline',
  UNKNOWN: 'unknown',
};

export function Monitoring() {
  const { data, isLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: async () => {
      const { data } = await api.get('/sites');
      return data.sites as Site[];
    },
    refetchInterval: 10000,
  });

  const sites = data || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-text">Мониторинг</h1>
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <RefreshCw className="w-3.5 h-3.5" />
          Автообновление каждые 10с
        </div>
      </div>

      {isLoading ? (
        <div className="text-text-secondary">Загрузка...</div>
      ) : sites.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Нет сайтов для мониторинга</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary text-left">
                <th className="px-4 py-3 font-medium w-8"></th>
                <th className="px-4 py-3 font-medium">Сайт</th>
                <th className="px-4 py-3 font-medium">Домен</th>
                <th className="px-4 py-3 font-medium">Сервер</th>
                <th className="px-4 py-3 font-medium">HTTP</th>
                <th className="px-4 py-3 font-medium">Отклик</th>
                <th className="px-4 py-3 font-medium">Последняя проверка</th>
                <th className="px-4 py-3 font-medium">Авторотация</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site, i) => (
                <tr key={site.id} className={`border-b border-border last:border-b-0 hover:bg-card-hover transition-colors ${i % 2 === 0 ? 'bg-card' : 'bg-stripe'}`}>
                  <td className="px-4 py-3">
                    <StatusDot status={statusMap[site.status] || 'unknown'} />
                  </td>
                  <td className="px-4 py-3 text-text font-medium">{site.name}</td>
                  <td className="px-4 py-3 text-accent text-xs font-mono">
                    {site.domain?.domain || '—'}
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs">
                    {site.server ? `${site.server.name}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {site.httpStatus ? (
                      <Badge variant={site.httpStatus < 400 ? 'success' : 'danger'}>
                        {site.httpStatus}
                      </Badge>
                    ) : (
                      <span className="text-text-secondary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs">
                    {site.responseTime ? (
                      <span className={site.responseTime > 2000 ? 'text-danger' : site.responseTime > 500 ? 'text-warning' : 'text-success'}>
                        {site.responseTime}ms
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs">
                    {site.lastCheckAt
                      ? new Date(site.lastCheckAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {site.autoRotation ? (
                      <Badge variant="info">Каждые {site.autoRotateAfter}д</Badge>
                    ) : (
                      <span className="text-text-secondary text-xs">Выкл</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
