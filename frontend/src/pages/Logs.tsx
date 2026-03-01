import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../api/client';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

interface LogEntry {
  id: string;
  action: string;
  target: string;
  details: any;
  ip: string;
  createdAt: string;
  user: { id: string; username: string } | null;
  site: { id: string; name: string } | null;
}

const actionLabels: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'info' | 'default' }> = {
  site_add: { label: 'Добавлен сайт', variant: 'success' },
  site_update: { label: 'Обновлён сайт', variant: 'info' },
  site_remove: { label: 'Удалён сайт', variant: 'danger' },
  server_add: { label: 'Добавлен сервер', variant: 'success' },
  server_remove: { label: 'Удалён сервер', variant: 'danger' },
  domain_add: { label: 'Добавлен домен', variant: 'success' },
  domain_remove: { label: 'Удалён домен', variant: 'danger' },
  domain_switch: { label: 'Смена домена', variant: 'warning' },
  domain_abuse: { label: 'Абуза домена', variant: 'danger' },
  deploy_start: { label: 'Запуск деплоя', variant: 'info' },
  backup_create: { label: 'Бэкап создан', variant: 'info' },
  backup_restore: { label: 'Бэкап восстановлен', variant: 'warning' },
  backup_delete: { label: 'Бэкап удалён', variant: 'danger' },
  backup_settings_update: { label: 'Настройки бэкапа', variant: 'info' },
  panic_switch: { label: 'ПАНИКА', variant: 'danger' },
  settings_change: { label: 'Настройки', variant: 'info' },
  login: { label: 'Вход', variant: 'default' },
  logout: { label: 'Выход', variant: 'default' },
};

export function Logs() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['logs', page],
    queryFn: async () => {
      const { data } = await api.get(`/logs?page=${page}&limit=30`);
      return data as { logs: LogEntry[]; total: number; page: number; pages: number };
    },
  });

  const logs = data?.logs || [];
  const pages = data?.pages || 1;

  return (
    <div>
      <h1 className="text-xl font-semibold text-text mb-6">Логи</h1>

      {isLoading ? (
        <div className="text-text-secondary">Загрузка...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Логов пока нет</p>
        </div>
      ) : (
        <>
          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-secondary text-left">
                  <th className="px-4 py-3 font-medium">Время</th>
                  <th className="px-4 py-3 font-medium">Действие</th>
                  <th className="px-4 py-3 font-medium">Пользователь</th>
                  <th className="px-4 py-3 font-medium">Цель</th>
                  <th className="px-4 py-3 font-medium">Сайт</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const actionConfig = actionLabels[log.action] || { label: log.action, variant: 'default' as const };
                  return (
                    <tr key={log.id} className={`border-b border-border last:border-b-0 hover:bg-card-hover transition-colors ${i % 2 === 0 ? 'bg-card' : 'bg-stripe'}`}>
                      <td className="px-4 py-3 text-text-secondary text-xs whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('ru-RU', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={actionConfig.variant}>{actionConfig.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-text">{log.user?.username || 'system'}</td>
                      <td className="px-4 py-3 text-text-secondary text-xs">{log.target || '—'}</td>
                      <td className="px-4 py-3 text-text-secondary text-xs">{log.site?.name || '—'}</td>
                      <td className="px-4 py-3 text-text-secondary text-xs font-mono">{log.ip || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-text-secondary">
                {page} из {pages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage(p => p + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
