import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Globe, ExternalLink, RefreshCw, ArrowRightLeft, LayoutGrid } from 'lucide-react';
import api from '../api/client';
import { Button } from '../components/ui/Button';
import { StatusDot } from '../components/ui/StatusDot';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import toast from 'react-hot-toast';

interface Site {
  id: string;
  name: string;
  sourceType: string;
  repoUrl: string | null;
  branch: string | null;
  deployPath: string;
  stack: string;
  status: string;
  port: number | null;
  autoRotation: boolean;
  autoRotateAfter: number;
  domainId: string | null;
  server: { id: string; name: string; ip: string } | null;
  domain: { id: string; domain: string; sslExpiresAt: string | null } | null;
  _count: { deploys: number };
  createdAt: string;
}

interface Server {
  id: string;
  name: string;
  ip: string;
}

interface Domain {
  id: string;
  domain: string;
  status: string;
}

const statusMap: Record<string, 'online' | 'offline' | 'warning' | 'unknown'> = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  DEPLOYING: 'warning',
  ERROR: 'offline',
  UNKNOWN: 'unknown',
};

const stackLabels: Record<string, string> = {
  AUTO: 'Авто',
  PHP_LARAVEL: 'PHP Laravel',
  PHP_WORDPRESS: 'WordPress',
  NODEJS: 'Node.js',
  PYTHON_DJANGO: 'Django',
  PYTHON_FASTAPI: 'FastAPI',
  DOCKER: 'Docker',
  STATIC: 'Статика',
};

export function Sites() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editSite, setEditSite] = useState<Site | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [switchDomainSite, setSwitchDomainSite] = useState<Site | null>(null);
  const [newDomainId, setNewDomainId] = useState('');

  const [form, setForm] = useState({
    name: '', sourceType: 'GIT', repoUrl: '', branch: 'main',
    deployPath: '', stack: 'AUTO', serverId: '', domainId: '',
    port: '3000', autoRotation: false, autoRotateAfter: '5',
    customScript: '', spareDomainIds: [] as string[],
  });

  const { data, isLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: async () => {
      const { data } = await api.get('/sites');
      return data.sites as Site[];
    },
  });

  const { data: servers } = useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const { data } = await api.get('/servers');
      return data.servers as Server[];
    },
  });

  const { data: freeDomains } = useQuery({
    queryKey: ['domains-free'],
    queryFn: async () => {
      const { data } = await api.get('/domains');
      return (data.domains as Domain[]).filter(d => d.status === 'FREE');
    },
  });

  const { data: allDomains } = useQuery({
    queryKey: ['domains-all'],
    queryFn: async () => {
      const { data } = await api.get('/domains');
      return data.domains as Domain[];
    },
    enabled: !!switchDomainSite,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: form.name,
        sourceType: form.sourceType,
        repoUrl: form.repoUrl || null,
        branch: form.branch || 'main',
        deployPath: form.deployPath,
        stack: form.stack,
        serverId: form.serverId,
        port: parseInt(form.port) || 3000,
        autoRotation: form.autoRotation,
        autoRotateAfter: parseInt(form.autoRotateAfter) || 5,
        customScript: form.customScript || null,
      };
      if (form.domainId) payload.domainId = form.domainId;
      if (form.spareDomainIds.length > 0) payload.spareDomainIds = form.spareDomainIds;
      return api.post('/sites', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.invalidateQueries({ queryKey: ['domains-free'] });
      setShowAdd(false);
      resetForm();
      toast.success('Сайт добавлен');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editSite) return;
      return api.put(`/sites/${editSite.id}`, {
        name: form.name,
        sourceType: form.sourceType,
        repoUrl: form.repoUrl || null,
        branch: form.branch || 'main',
        deployPath: form.deployPath,
        stack: form.stack,
        serverId: form.serverId,
        port: parseInt(form.port) || 3000,
        autoRotation: form.autoRotation,
        autoRotateAfter: parseInt(form.autoRotateAfter) || 5,
        customScript: form.customScript || null,
        domainId: form.domainId || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.invalidateQueries({ queryKey: ['domains-free'] });
      setEditSite(null);
      resetForm();
      toast.success('Сайт обновлён');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/sites/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.invalidateQueries({ queryKey: ['domains-free'] });
      setDeleteId(null);
      toast.success('Сайт удалён');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  const switchDomainMutation = useMutation({
    mutationFn: async () => {
      if (!switchDomainSite) return;
      return api.post(`/sites/${switchDomainSite.id}/switch-domain`, { newDomainId });
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.invalidateQueries({ queryKey: ['domains-free'] });
      queryClient.invalidateQueries({ queryKey: ['domains-all'] });
      setSwitchDomainSite(null);
      setNewDomainId('');
      toast.success(`Домен сменён: ${res?.data?.oldDomain} → ${res?.data?.newDomain}`);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  function resetForm() {
    setForm({
      name: '', sourceType: 'GIT', repoUrl: '', branch: 'main',
      deployPath: '', stack: 'AUTO', serverId: '', domainId: '',
      port: '3000', autoRotation: false, autoRotateAfter: '5',
      customScript: '', spareDomainIds: [],
    });
  }

  function openEdit(site: Site) {
    setForm({
      name: site.name,
      sourceType: site.sourceType,
      repoUrl: site.repoUrl || '',
      branch: site.branch || 'main',
      deployPath: site.deployPath,
      stack: site.stack,
      serverId: site.server?.id || '',
      domainId: site.domainId || '',
      port: String(site.port || 3000),
      autoRotation: site.autoRotation,
      autoRotateAfter: String(site.autoRotateAfter),
      customScript: '',
      spareDomainIds: [],
    });
    setEditSite(site);
  }

  const sites = data || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-text">Сайты</h1>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4" />
          Добавить сайт
        </Button>
      </div>

      {isLoading ? (
        <div className="text-text-secondary">Загрузка...</div>
      ) : sites.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          <LayoutGrid className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Сайтов пока нет</p>
          <p className="text-sm mt-1">Добавьте первый сайт для начала работы</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary text-left">
                <th className="px-4 py-3 font-medium w-8"></th>
                <th className="px-4 py-3 font-medium">Название</th>
                <th className="px-4 py-3 font-medium">Домен</th>
                <th className="px-4 py-3 font-medium">Сервер</th>
                <th className="px-4 py-3 font-medium">Стек</th>
                <th className="px-4 py-3 font-medium">Деплоев</th>
                <th className="px-4 py-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site, i) => (
                <tr key={site.id} className={`border-b border-border last:border-b-0 hover:bg-card-hover transition-colors ${i % 2 === 0 ? 'bg-card' : 'bg-stripe'}`}>
                  <td className="px-4 py-3">
                    <StatusDot status={statusMap[site.status] || 'unknown'} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-text font-medium">{site.name}</span>
                    {site.autoRotation && <Badge variant="info" >Авторотация</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    {site.domain ? (
                      <span className="text-accent text-xs font-mono">{site.domain.domain}</span>
                    ) : (
                      <span className="text-text-secondary text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs">
                    {site.server ? `${site.server.name} (${site.server.ip})` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{stackLabels[site.stack] || site.stack}</Badge>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{site._count.deploys}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(site)}
                        className="p-1.5 text-text-secondary hover:text-text rounded-lg hover:bg-card-hover transition-colors"
                        title="Редактировать"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { setSwitchDomainSite(site); }}
                        className="p-1.5 text-text-secondary hover:text-accent rounded-lg hover:bg-card-hover transition-colors"
                        title="Сменить домен"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteId(site.id)}
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

      {/* Add / Edit Site Modal */}
      <Modal
        isOpen={showAdd || !!editSite}
        onClose={() => { setShowAdd(false); setEditSite(null); resetForm(); }}
        title={editSite ? 'Редактировать сайт' : 'Добавить сайт'}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={(e) => { e.preventDefault(); editSite ? updateMutation.mutate() : addMutation.mutate(); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Название" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="my-site" />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-text-secondary">Сервер</label>
              <select
                value={form.serverId}
                onChange={e => setForm({...form, serverId: e.target.value})}
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
              >
                <option value="">Выберите сервер</option>
                {(servers || []).map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.ip})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-text-secondary">Источник</label>
              <select
                value={form.sourceType}
                onChange={e => setForm({...form, sourceType: e.target.value})}
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
              >
                <option value="GIT">Git</option>
                <option value="ARCHIVE">Архив</option>
                <option value="PATH">Путь</option>
              </select>
            </div>
            <Input label="Ветка" value={form.branch} onChange={e => setForm({...form, branch: e.target.value})} placeholder="main" />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-text-secondary">Стек</label>
              <select
                value={form.stack}
                onChange={e => setForm({...form, stack: e.target.value})}
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
              >
                {Object.entries(stackLabels).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {form.sourceType === 'GIT' && (
            <Input label="URL репозитория" value={form.repoUrl} onChange={e => setForm({...form, repoUrl: e.target.value})} placeholder="https://github.com/user/repo.git" />
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input label="Путь деплоя" value={form.deployPath} onChange={e => setForm({...form, deployPath: e.target.value})} placeholder="/var/www/site" />
            <Input label="Порт" type="number" value={form.port} onChange={e => setForm({...form, port: e.target.value})} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-text-secondary">Основной домен</label>
              <select
                value={form.domainId}
                onChange={e => setForm({...form, domainId: e.target.value})}
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
              >
                <option value="">Без домена</option>
                {(freeDomains || []).map(d => (
                  <option key={d.id} value={d.id}>{d.domain}</option>
                ))}
              </select>
            </div>
            <Input
              label="Авторотация после (дней)"
              type="number"
              value={form.autoRotateAfter}
              onChange={e => setForm({...form, autoRotateAfter: e.target.value})}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={form.autoRotation}
              onChange={e => setForm({...form, autoRotation: e.target.checked})}
              className="rounded border-border"
            />
            Включить авторотацию доменов
          </label>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-text-secondary">Кастомный скрипт деплоя</label>
            <textarea
              value={form.customScript}
              onChange={e => setForm({...form, customScript: e.target.value})}
              placeholder="#!/bin/bash&#10;npm install&#10;npm run build"
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-text text-sm font-mono h-20 resize-none focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setShowAdd(false); setEditSite(null); resetForm(); }}>
              Отмена
            </Button>
            <Button type="submit" loading={addMutation.isPending || updateMutation.isPending}>
              {editSite ? 'Сохранить' : 'Добавить'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Switch Domain Modal */}
      <Modal
        isOpen={!!switchDomainSite}
        onClose={() => { setSwitchDomainSite(null); setNewDomainId(''); }}
        title={`Сменить домен: ${switchDomainSite?.name || ''}`}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="text-sm text-text-secondary">
            Текущий домен: <span className="text-text font-mono">{switchDomainSite?.domain?.domain || 'нет'}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-text-secondary">Новый домен</label>
            <select
              value={newDomainId}
              onChange={e => setNewDomainId(e.target.value)}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
            >
              <option value="">Выберите домен</option>
              {(allDomains || []).filter(d => d.status === 'FREE' || d.id === switchDomainSite?.domainId).map(d => (
                <option key={d.id} value={d.id}>{d.domain} ({d.status})</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => { setSwitchDomainSite(null); setNewDomainId(''); }}>
              Отмена
            </Button>
            <Button
              onClick={() => switchDomainMutation.mutate()}
              loading={switchDomainMutation.isPending}
              disabled={!newDomainId}
            >
              Сменить
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Удалить сайт"
        message="Вы уверены? Все связанные деплои и логи будут удалены."
        confirmText="Удалить"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
