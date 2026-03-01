import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HardDrive, Plus, RotateCcw, Trash2, ChevronLeft, ChevronRight, Database, Clock, Settings2 } from 'lucide-react';
import api from '../api/client';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import toast from 'react-hot-toast';

interface Backup {
  id: string;
  siteId: string;
  serverId: string;
  type: 'AUTO' | 'MANUAL';
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  filePath: string | null;
  fileSize: string | null;
  dbIncluded: boolean;
  dbType: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  site: { id: string; name: string };
}

interface Site {
  id: string;
  name: string;
}

interface BackupSettings {
  enabled: boolean;
  cronTime: string;
  retentionDays: number;
  maxPerSite: number;
}

interface Server {
  id: string;
  name: string;
  ip: string;
}

const statusConfig: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'info' | 'default' }> = {
  PENDING: { label: 'Ожидает', variant: 'default' },
  RUNNING: { label: 'Выполняется', variant: 'warning' },
  SUCCESS: { label: 'Успешно', variant: 'success' },
  FAILED: { label: 'Ошибка', variant: 'danger' },
};

function formatFileSize(bytes: string | null): string {
  if (!bytes) return '—';
  const num = parseInt(bytes, 10);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type TabKey = 'list' | 'settings';

export function Backups() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('list');
  const [page, setPage] = useState(1);
  const [showCreateBackup, setShowCreateBackup] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [deleteBackupId, setDeleteBackupId] = useState<string | null>(null);
  const [restoreBackupId, setRestoreBackupId] = useState<string | null>(null);
  const [restoreServerId, setRestoreServerId] = useState('');

  // Fetch backups
  const { data, isLoading } = useQuery({
    queryKey: ['backups', page],
    queryFn: async () => {
      const { data } = await api.get(`/backups?page=${page}&limit=20`);
      return data as { backups: Backup[]; total: number; page: number; pages: number };
    },
    refetchInterval: 5000,
  });

  // Fetch sites for selection
  const { data: sitesData } = useQuery({
    queryKey: ['sites-list'],
    queryFn: async () => {
      const { data } = await api.get('/sites');
      return data.sites as Site[];
    },
  });

  // Fetch servers for restore target
  const { data: serversData } = useQuery({
    queryKey: ['servers-list'],
    queryFn: async () => {
      const { data } = await api.get('/servers');
      return data.servers as Server[];
    },
  });

  // Fetch backup settings
  const { data: settingsData } = useQuery({
    queryKey: ['backup-settings'],
    queryFn: async () => {
      const { data } = await api.get('/backups/settings');
      return data.settings as BackupSettings;
    },
  });

  const [settingsForm, setSettingsForm] = useState<BackupSettings | null>(null);

  // Use settingsData when form is not initialized
  const currentSettings = settingsForm || settingsData || { enabled: false, cronTime: '0 3 * * *', retentionDays: 30, maxPerSite: 10 };

  // Create backup
  const createMutation = useMutation({
    mutationFn: async () => {
      return api.post('/backups', { siteId: selectedSiteId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      setShowCreateBackup(false);
      setSelectedSiteId('');
      toast.success('Бэкап запущен');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  // Restore backup
  const restoreMutation = useMutation({
    mutationFn: async () => {
      return api.post(`/backups/${restoreBackupId}/restore`, {
        targetServerId: restoreServerId || undefined,
      });
    },
    onSuccess: () => {
      setRestoreBackupId(null);
      setRestoreServerId('');
      toast.success('Бэкап восстановлен');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка восстановления'),
  });

  // Delete backup
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/backups/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      setDeleteBackupId(null);
      toast.success('Бэкап удалён');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  // Save settings
  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      return api.put('/backups/settings', currentSettings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup-settings'] });
      toast.success('Настройки сохранены');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  const backups = data?.backups || [];
  const pages = data?.pages || 1;
  const sites = sitesData || [];
  const servers = serversData || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-text">Бэкапы</h1>
        <Button onClick={() => setShowCreateBackup(true)} size="sm">
          <Plus className="w-4 h-4" />
          Создать бэкап
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setActiveTab('list')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'list'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-secondary hover:text-text'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          Все бэкапы
        </button>
        <button
          onClick={() => {
            setActiveTab('settings');
            if (settingsData && !settingsForm) setSettingsForm({ ...settingsData });
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'settings'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-secondary hover:text-text'
          }`}
        >
          <Settings2 className="w-4 h-4" />
          Настройки
        </button>
      </div>

      {activeTab === 'list' && (
        <>
          {isLoading ? (
            <div className="text-text-secondary">Загрузка...</div>
          ) : backups.length === 0 ? (
            <div className="text-center py-12 text-text-secondary">
              <HardDrive className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Бэкапов пока нет</p>
              <p className="text-xs mt-1">Создайте первый бэкап или настройте автоматическое резервное копирование</p>
            </div>
          ) : (
            <>
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-text-secondary text-left">
                      <th className="px-4 py-3 font-medium">Сайт</th>
                      <th className="px-4 py-3 font-medium">Тип</th>
                      <th className="px-4 py-3 font-medium">Статус</th>
                      <th className="px-4 py-3 font-medium">Размер</th>
                      <th className="px-4 py-3 font-medium">БД</th>
                      <th className="px-4 py-3 font-medium">Создан</th>
                      <th className="px-4 py-3 font-medium">Истекает</th>
                      <th className="px-4 py-3 font-medium">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.map((backup, i) => {
                      const statusCfg = statusConfig[backup.status] || { label: backup.status, variant: 'default' as const };
                      return (
                        <tr key={backup.id} className={`border-b border-border last:border-b-0 hover:bg-card-hover transition-colors ${i % 2 === 0 ? 'bg-card' : 'bg-stripe'}`}>
                          <td className="px-4 py-3 text-text font-medium">{backup.site.name}</td>
                          <td className="px-4 py-3">
                            <Badge variant={backup.type === 'AUTO' ? 'info' : 'default'}>
                              {backup.type === 'AUTO' ? 'Авто' : 'Ручной'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                          </td>
                          <td className="px-4 py-3 text-text-secondary text-xs font-mono">
                            {formatFileSize(backup.fileSize)}
                          </td>
                          <td className="px-4 py-3">
                            {backup.dbIncluded ? (
                              <span className="flex items-center gap-1 text-xs text-success">
                                <Database className="w-3 h-3" />
                                {backup.dbType || 'DB'}
                              </span>
                            ) : (
                              <span className="text-text-secondary text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-text-secondary text-xs">
                            {new Date(backup.createdAt).toLocaleString('ru-RU', {
                              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                            })}
                          </td>
                          <td className="px-4 py-3 text-text-secondary text-xs">
                            {backup.expiresAt ? (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(backup.expiresAt).toLocaleDateString('ru-RU')}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {backup.status === 'SUCCESS' && (
                                <button
                                  onClick={() => setRestoreBackupId(backup.id)}
                                  className="p-1.5 text-text-secondary hover:text-accent rounded-lg hover:bg-card-hover transition-colors"
                                  title="Восстановить"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => setDeleteBackupId(backup.id)}
                                className="p-1.5 text-text-secondary hover:text-danger rounded-lg hover:bg-card-hover transition-colors"
                                title="Удалить"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-4">
                  <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-text-secondary">{page} из {pages}</span>
                  <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {activeTab === 'settings' && (
        <div className="bg-card border border-border rounded-xl p-6 max-w-lg">
          <h2 className="text-lg font-medium text-text mb-4">Настройки автобэкапа</h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text font-medium">Автоматический бэкап</p>
                <p className="text-xs text-text-secondary">Резервное копирование всех сайтов по расписанию</p>
              </div>
              <button
                onClick={() => {
                  setSettingsForm({ ...currentSettings, enabled: !currentSettings.enabled });
                }}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  currentSettings.enabled ? 'bg-accent' : 'bg-card-hover'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                    currentSettings.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <Input
              label="Расписание (cron)"
              value={currentSettings.cronTime}
              onChange={e => setSettingsForm({ ...currentSettings, cronTime: e.target.value })}
              placeholder="0 3 * * *"
            />
            <p className="text-xs text-text-secondary -mt-2">По умолчанию: каждый день в 03:00</p>

            <Input
              label="Срок хранения (дней)"
              type="number"
              value={currentSettings.retentionDays.toString()}
              onChange={e => setSettingsForm({ ...currentSettings, retentionDays: parseInt(e.target.value) || 30 })}
            />

            <Input
              label="Максимум бэкапов на сайт"
              type="number"
              value={currentSettings.maxPerSite.toString()}
              onChange={e => setSettingsForm({ ...currentSettings, maxPerSite: parseInt(e.target.value) || 10 })}
            />

            <Button
              onClick={() => saveSettingsMutation.mutate()}
              loading={saveSettingsMutation.isPending}
              size="sm"
            >
              Сохранить
            </Button>
          </div>
        </div>
      )}

      {/* Create Backup Modal */}
      <Modal isOpen={showCreateBackup} onClose={() => setShowCreateBackup(false)} title="Создать бэкап" maxWidth="max-w-md">
        <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-text-secondary">Сайт</label>
            <select
              value={selectedSiteId}
              onChange={e => setSelectedSiteId(e.target.value)}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
              required
            >
              <option value="">Выберите сайт</option>
              {sites.map(site => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-text-secondary">
            Будет создана резервная копия файлов сайта и базы данных (если обнаружена).
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreateBackup(false)}>
              Отмена
            </Button>
            <Button type="submit" loading={createMutation.isPending} disabled={!selectedSiteId}>
              Создать
            </Button>
          </div>
        </form>
      </Modal>

      {/* Restore Modal */}
      <Modal
        isOpen={!!restoreBackupId}
        onClose={() => { setRestoreBackupId(null); setRestoreServerId(''); }}
        title="Восстановить бэкап"
        maxWidth="max-w-md"
      >
        <form onSubmit={(e) => { e.preventDefault(); restoreMutation.mutate(); }} className="space-y-4">
          <p className="text-sm text-text-secondary">
            Восстановление заменит текущие файлы сайта и базу данных содержимым бэкапа.
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-text-secondary">Целевой сервер (необязательно)</label>
            <select
              value={restoreServerId}
              onChange={e => setRestoreServerId(e.target.value)}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
            >
              <option value="">Исходный сервер</option>
              {servers.map(server => (
                <option key={server.id} value={server.id}>{server.name} ({server.ip})</option>
              ))}
            </select>
          </div>
          <div className="bg-warning/10 border border-warning/20 rounded-lg p-3">
            <p className="text-xs text-warning font-medium">Внимание: это действие перезапишет текущие данные сайта!</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setRestoreBackupId(null); setRestoreServerId(''); }}>
              Отмена
            </Button>
            <Button type="submit" loading={restoreMutation.isPending} variant="primary">
              Восстановить
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteBackupId}
        onClose={() => setDeleteBackupId(null)}
        onConfirm={() => deleteBackupId && deleteMutation.mutate(deleteBackupId)}
        title="Удалить бэкап"
        message="Вы уверены? Файл бэкапа будет удалён безвозвратно."
        confirmText="Удалить"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
