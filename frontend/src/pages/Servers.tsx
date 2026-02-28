import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Wifi, Terminal, Trash2, RefreshCw, Server as ServerIcon } from 'lucide-react';
import api from '../api/client';
import { Button } from '../components/ui/Button';
import { StatusDot } from '../components/ui/StatusDot';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import toast from 'react-hot-toast';

interface Server {
  id: string;
  name: string;
  ip: string;
  sshPort: number;
  sshAuthType: string;
  sshUser: string;
  provider: string | null;
  location: string | null;
  isSpare: boolean;
  status: string;
  lastPing: string | null;
  cpuUsage: number | null;
  ramUsage: number | null;
  diskUsage: number | null;
  sitesCount: number;
  createdAt: string;
}

const statusMap: Record<string, 'online' | 'offline' | 'warning' | 'unknown'> = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  ERROR: 'offline',
  UNKNOWN: 'unknown',
};

export function Servers() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', ip: '', sshPort: '22', sshAuthType: 'KEY' as 'KEY' | 'PASSWORD',
    sshUser: 'root', sshPassword: '', sshKey: '', provider: '', location: '', isSpare: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const { data } = await api.get('/servers');
      return data.servers as Server[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: form.name,
        ip: form.ip,
        sshPort: parseInt(form.sshPort),
        sshAuthType: form.sshAuthType,
        sshUser: form.sshUser,
        provider: form.provider || null,
        location: form.location || null,
        isSpare: form.isSpare,
      };
      if (form.sshAuthType === 'PASSWORD') payload.sshPassword = form.sshPassword;
      else payload.sshKey = form.sshKey;
      return api.post('/servers', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      setShowAdd(false);
      resetForm();
      toast.success('Сервер добавлен');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/servers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      setDeleteId(null);
      toast.success('Сервер удалён');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  const pingMutation = useMutation({
    mutationFn: (id: string) => api.post(`/servers/${id}/ping`),
    onSuccess: (res, id) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      toast.success(res.data.success ? `Сервер доступен (${res.data.timeMs}ms)` : 'Сервер недоступен');
    },
    onError: () => toast.error('Ошибка пинга'),
  });

  const testSSHMutation = useMutation({
    mutationFn: (id: string) => api.post(`/servers/${id}/test-ssh`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      if (res.data.success) toast.success('SSH подключение успешно');
      else toast.error(`SSH ошибка: ${res.data.error}`);
    },
    onError: () => toast.error('Ошибка проверки SSH'),
  });

  function resetForm() {
    setForm({ name: '', ip: '', sshPort: '22', sshAuthType: 'KEY', sshUser: 'root', sshPassword: '', sshKey: '', provider: '', location: '', isSpare: false });
  }

  const servers = data || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-text">Серверы</h1>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4" />
          Добавить сервер
        </Button>
      </div>

      {isLoading ? (
        <div className="text-text-secondary">Загрузка...</div>
      ) : servers.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          <ServerIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Серверов пока нет</p>
          <p className="text-sm mt-1">Добавьте первый сервер для начала работы</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary text-left">
                <th className="px-4 py-3 font-medium w-8"></th>
                <th className="px-4 py-3 font-medium">Название</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">Провайдер</th>
                <th className="px-4 py-3 font-medium">Локация</th>
                <th className="px-4 py-3 font-medium">Сайтов</th>
                <th className="px-4 py-3 font-medium">CPU/RAM/Disk</th>
                <th className="px-4 py-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {servers.map((server, i) => (
                <tr key={server.id} className={`border-b border-border last:border-b-0 hover:bg-card-hover transition-colors ${i % 2 === 0 ? 'bg-card' : 'bg-stripe'}`}>
                  <td className="px-4 py-3">
                    <StatusDot status={statusMap[server.status] || 'unknown'} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-text font-medium">{server.name}</span>
                      {server.isSpare && <Badge variant="warning">Запасной</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary font-mono text-xs">{server.ip}:{server.sshPort}</td>
                  <td className="px-4 py-3 text-text-secondary">{server.provider || '—'}</td>
                  <td className="px-4 py-3 text-text-secondary">{server.location || '—'}</td>
                  <td className="px-4 py-3 text-text-secondary">{server.sitesCount}</td>
                  <td className="px-4 py-3 text-text-secondary text-xs font-mono">
                    {server.cpuUsage !== null ? (
                      <span>{server.cpuUsage}% / {server.ramUsage}% / {server.diskUsage}%</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => pingMutation.mutate(server.id)}
                        className="p-1.5 text-text-secondary hover:text-text rounded-lg hover:bg-card-hover transition-colors"
                        title="Пинг"
                      >
                        <Wifi className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => testSSHMutation.mutate(server.id)}
                        className="p-1.5 text-text-secondary hover:text-text rounded-lg hover:bg-card-hover transition-colors"
                        title="Тест SSH"
                      >
                        <Terminal className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteId(server.id)}
                        className="p-1.5 text-text-secondary hover:text-danger rounded-lg hover:bg-card-hover transition-colors"
                        title="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Server Modal */}
      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); resetForm(); }} title="Добавить сервер" maxWidth="max-w-xl">
        <form onSubmit={(e) => { e.preventDefault(); addMutation.mutate(); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Название" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="server-01" />
            <Input label="IP адрес" value={form.ip} onChange={e => setForm({...form, ip: e.target.value})} placeholder="123.45.67.89" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input label="SSH порт" type="number" value={form.sshPort} onChange={e => setForm({...form, sshPort: e.target.value})} />
            <Input label="SSH пользователь" value={form.sshUser} onChange={e => setForm({...form, sshUser: e.target.value})} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-text-secondary">Метод авторизации</label>
              <select
                value={form.sshAuthType}
                onChange={e => setForm({...form, sshAuthType: e.target.value as 'KEY' | 'PASSWORD'})}
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
              >
                <option value="KEY">SSH ключ</option>
                <option value="PASSWORD">Пароль</option>
              </select>
            </div>
          </div>

          {form.sshAuthType === 'PASSWORD' ? (
            <Input label="SSH пароль" type="password" value={form.sshPassword} onChange={e => setForm({...form, sshPassword: e.target.value})} />
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-text-secondary">SSH приватный ключ</label>
              <textarea
                value={form.sshKey}
                onChange={e => setForm({...form, sshKey: e.target.value})}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-text text-sm font-mono h-24 resize-none focus:outline-none focus:border-accent"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input label="Провайдер" value={form.provider} onChange={e => setForm({...form, provider: e.target.value})} placeholder="Hetzner, DO, etc." />
            <Input label="Локация" value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="EU, US, etc." />
          </div>

          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={form.isSpare}
              onChange={e => setForm({...form, isSpare: e.target.checked})}
              className="rounded border-border"
            />
            Запасной сервер
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setShowAdd(false); resetForm(); }}>
              Отмена
            </Button>
            <Button type="submit" loading={addMutation.isPending}>
              Добавить
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Удалить сервер"
        message="Вы уверены? Это действие нельзя отменить."
        confirmText="Удалить"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
