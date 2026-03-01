import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Rocket, Play, XCircle, Clock, CheckCircle, AlertCircle, Loader2, ScrollText } from 'lucide-react';
import api from '../api/client';
import { socket, connectSocket } from '../api/socket';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import toast from 'react-hot-toast';

interface Site {
  id: string;
  name: string;
  status: string;
  domain: { domain: string } | null;
  server: { name: string; ip: string } | null;
  stack: string;
}

interface DeployRecord {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  duration: number | null;
  log: string | null;
  withSsl: boolean;
  site: { id: string; name: string };
  user: { id: string; username: string };
}

const statusConfig: Record<string, { icon: typeof CheckCircle; variant: 'success' | 'danger' | 'warning' | 'info' | 'default'; label: string }> = {
  PENDING: { icon: Clock, variant: 'warning', label: 'Ожидание' },
  RUNNING: { icon: Loader2, variant: 'info', label: 'Выполняется' },
  SUCCESS: { icon: CheckCircle, variant: 'success', label: 'Успешно' },
  FAILED: { icon: AlertCircle, variant: 'danger', label: 'Ошибка' },
  CANCELLED: { icon: XCircle, variant: 'default', label: 'Отменён' },
};

export function Deploy() {
  const queryClient = useQueryClient();
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [withSsl, setWithSsl] = useState(true);
  const [activeDeployId, setActiveDeployId] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [viewLogDeploy, setViewLogDeploy] = useState<DeployRecord | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: async () => {
      const { data } = await api.get('/sites');
      return data.sites as Site[];
    },
  });

  const { data: deploys, isLoading } = useQuery({
    queryKey: ['deploys'],
    queryFn: async () => {
      const { data } = await api.get('/deploys');
      return data.deploys as DeployRecord[];
    },
    refetchInterval: 5000,
  });

  // Socket.IO for real-time logs
  useEffect(() => {
    if (!activeDeployId) return;

    connectSocket();

    socket.emit('deploy:subscribe', activeDeployId);

    const handleLog = (data: { deployId: string; line: string }) => {
      if (data.deployId === activeDeployId) {
        setLogLines(prev => [...prev, data.line]);
      }
    };

    const handleStatus = (data: { deployId: string; status: string }) => {
      if (data.deployId === activeDeployId) {
        queryClient.invalidateQueries({ queryKey: ['deploys'] });
        queryClient.invalidateQueries({ queryKey: ['sites'] });
        if (['SUCCESS', 'FAILED', 'CANCELLED'].includes(data.status)) {
          if (data.status === 'SUCCESS') toast.success('Деплой завершён успешно!');
          if (data.status === 'FAILED') toast.error('Деплой завершился с ошибкой');
        }
      }
    };

    socket.on('deploy:log', handleLog);
    socket.on('deploy:status', handleStatus);

    return () => {
      socket.emit('deploy:unsubscribe', activeDeployId);
      socket.off('deploy:log', handleLog);
      socket.off('deploy:status', handleStatus);
    };
  }, [activeDeployId, queryClient]);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logLines]);

  const deployMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/deploys', { siteId: selectedSiteId, withSsl });
      return data.deploy as DeployRecord;
    },
    onSuccess: (deploy) => {
      queryClient.invalidateQueries({ queryKey: ['deploys'] });
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      setActiveDeployId(deploy.id);
      setLogLines([]);
      toast.success(`Деплой запущен: ${deploy.site.name}`);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка запуска деплоя'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/deploys/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deploys'] });
      toast.success('Деплой отменён');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  function formatDuration(seconds: number | null) {
    if (!seconds) return '—';
    if (seconds < 60) return `${seconds}с`;
    return `${Math.floor(seconds / 60)}м ${seconds % 60}с`;
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-text">Деплой</h1>
      </div>

      {/* Deploy Form */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="text-sm text-text-secondary mb-1.5 block">Сайт</label>
            <select
              value={selectedSiteId}
              onChange={e => setSelectedSiteId(e.target.value)}
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
            >
              <option value="">Выберите сайт</option>
              {(sites || []).map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.domain ? `(${s.domain.domain})` : ''} — {s.server?.name || 'нет сервера'}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer pb-2">
            <input
              type="checkbox"
              checked={withSsl}
              onChange={e => setWithSsl(e.target.checked)}
              className="rounded border-border"
            />
            SSL
          </label>
          <Button
            onClick={() => deployMutation.mutate()}
            disabled={!selectedSiteId}
            loading={deployMutation.isPending}
          >
            <Rocket className="w-4 h-4" />
            Задеплоить
          </Button>
        </div>
      </div>

      {/* Active deploy log viewer */}
      {activeDeployId && logLines.length > 0 && (
        <div className="bg-card border border-border rounded-xl mb-6 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <span className="text-sm text-text-secondary flex items-center gap-2">
              <ScrollText className="w-4 h-4" />
              Лог деплоя (live)
            </span>
            <button
              onClick={() => { setActiveDeployId(null); setLogLines([]); }}
              className="text-xs text-text-secondary hover:text-text"
            >
              Закрыть
            </button>
          </div>
          <div className="bg-bg p-4 font-mono text-xs max-h-80 overflow-y-auto">
            {logLines.map((line, i) => (
              <div key={i} className={`${line.includes('FAILED') || line.includes('[stderr]') ? 'text-danger' : line.includes('===') ? 'text-accent' : 'text-text-secondary'}`}>
                {line}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* Deploy History */}
      <h2 className="text-lg font-medium text-text mb-3">История деплоев</h2>
      {isLoading ? (
        <div className="text-text-secondary">Загрузка...</div>
      ) : !deploys || deploys.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          <Rocket className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Деплоев пока не было</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary text-left">
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Сайт</th>
                <th className="px-4 py-3 font-medium">Пользователь</th>
                <th className="px-4 py-3 font-medium">Время</th>
                <th className="px-4 py-3 font-medium">Длительность</th>
                <th className="px-4 py-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {deploys.map((deploy, i) => {
                const config = statusConfig[deploy.status] || statusConfig.PENDING;
                const Icon = config.icon;
                return (
                  <tr key={deploy.id} className={`border-b border-border last:border-b-0 hover:bg-card-hover transition-colors ${i % 2 === 0 ? 'bg-card' : 'bg-stripe'}`}>
                    <td className="px-4 py-3">
                      <Badge variant={config.variant}>
                        <Icon className={`w-3 h-3 mr-1 inline ${deploy.status === 'RUNNING' ? 'animate-spin' : ''}`} />
                        {config.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-text font-medium">{deploy.site.name}</td>
                    <td className="px-4 py-3 text-text-secondary">{deploy.user.username}</td>
                    <td className="px-4 py-3 text-text-secondary text-xs">{formatTime(deploy.startedAt)}</td>
                    <td className="px-4 py-3 text-text-secondary">{formatDuration(deploy.duration)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {deploy.log && (
                          <button
                            onClick={() => setViewLogDeploy(deploy)}
                            className="p-1.5 text-text-secondary hover:text-text rounded-lg hover:bg-card-hover transition-colors"
                            title="Посмотреть лог"
                          >
                            <ScrollText className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {['PENDING', 'RUNNING'].includes(deploy.status) && (
                          <>
                            <button
                              onClick={() => { setActiveDeployId(deploy.id); setLogLines([]); }}
                              className="p-1.5 text-text-secondary hover:text-accent rounded-lg hover:bg-card-hover transition-colors"
                              title="Следить за логом"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => cancelMutation.mutate(deploy.id)}
                              className="p-1.5 text-text-secondary hover:text-danger rounded-lg hover:bg-card-hover transition-colors"
                              title="Отменить"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* View Log Modal */}
      <Modal
        isOpen={!!viewLogDeploy}
        onClose={() => setViewLogDeploy(null)}
        title={`Лог деплоя: ${viewLogDeploy?.site.name || ''}`}
        maxWidth="max-w-4xl"
      >
        <div className="bg-bg rounded-lg p-4 font-mono text-xs max-h-96 overflow-y-auto">
          {viewLogDeploy?.log?.split('\n').map((line, i) => (
            <div key={i} className={`${line.includes('FAILED') || line.includes('[stderr]') ? 'text-danger' : line.includes('===') ? 'text-accent' : 'text-text-secondary'}`}>
              {line}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
