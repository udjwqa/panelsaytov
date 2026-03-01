import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Shield, ShieldAlert, ShieldCheck, RefreshCw, Globe } from 'lucide-react';
import api from '../api/client';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import toast from 'react-hot-toast';

interface Domain {
  id: string;
  domain: string;
  type: string;
  status: string;
  cloudflareZone: string | null;
  hasCloudflareToken?: boolean;
  sslExpiresAt: string | null;
  sslStatus: string | null;
  lastDnsCheck: string | null;
  dnsResolvesTo: string | null;
  site: { id: string; name: string } | null;
  createdAt: string;
}

type TabKey = 'ALL' | 'ACTIVE' | 'FREE' | 'ABUSED';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'ALL', label: 'Все' },
  { key: 'ACTIVE', label: 'Активные' },
  { key: 'FREE', label: 'Свободные' },
  { key: 'ABUSED', label: 'Абузные' },
];

const statusBadge: Record<string, { variant: 'success' | 'default' | 'danger' | 'warning'; label: string }> = {
  ACTIVE: { variant: 'success', label: 'Активный' },
  FREE: { variant: 'default', label: 'Свободный' },
  ABUSED: { variant: 'danger', label: 'Абуза' },
};

const typeBadge: Record<string, { variant: 'info' | 'warning'; label: string }> = {
  PRIMARY: { variant: 'info', label: 'Основной' },
  SPARE: { variant: 'warning', label: 'Запасной' },
};

export function Domains() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('ALL');
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    domain: '', cloudflareZone: '', cloudflareToken: '', type: 'PRIMARY',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['domains'],
    queryFn: async () => {
      const { data } = await api.get('/domains');
      return data.domains as Domain[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      return api.post('/domains', {
        domain: form.domain,
        cloudflareZone: form.cloudflareZone || null,
        cloudflareToken: form.cloudflareToken || null,
        type: form.type,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      setShowAdd(false);
      resetForm();
      toast.success('Домен добавлен');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/domains/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      setDeleteId(null);
      toast.success('Домен удалён');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  const checkDnsMutation = useMutation({
    mutationFn: (id: string) => api.post(`/domains/${id}/check-dns`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      if (res.data.success) {
        toast.success(`DNS: ${res.data.resolvesTo}`);
      } else {
        toast.error(res.data.error || 'DNS не резолвится');
      }
    },
    onError: () => toast.error('Ошибка проверки DNS'),
  });

  const checkSslMutation = useMutation({
    mutationFn: (id: string) => api.post(`/domains/${id}/check-ssl`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      if (res.data.valid) {
        toast.success(`SSL валидный, до ${new Date(res.data.expiresAt).toLocaleDateString()}`);
      } else {
        toast.error(res.data.error || 'SSL невалидный');
      }
    },
    onError: () => toast.error('Ошибка проверки SSL'),
  });

  const markAbusedMutation = useMutation({
    mutationFn: (id: string) => api.post(`/domains/${id}/mark-abused`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      toast.success('Домен помечен как абузный');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.post(`/domains/${id}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      toast.success('Домен восстановлен');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  function resetForm() {
    setForm({ domain: '', cloudflareZone: '', cloudflareToken: '', type: 'PRIMARY' });
  }

  const domains = data || [];
  const filtered = activeTab === 'ALL' ? domains : domains.filter(d => d.status === activeTab);

  const counts = {
    ALL: domains.length,
    ACTIVE: domains.filter(d => d.status === 'ACTIVE').length,
    FREE: domains.filter(d => d.status === 'FREE').length,
    ABUSED: domains.filter(d => d.status === 'ABUSED').length,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-text">Домены</h1>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4" />
          Добавить домен
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-border">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-accent text-accent'
                : 'border-transparent text-text-secondary hover:text-text'
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-xs opacity-60">({counts[tab.key]})</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-text-secondary">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Доменов не найдено</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary text-left">
                <th className="px-4 py-3 font-medium">Домен</th>
                <th className="px-4 py-3 font-medium">Тип</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Сайт</th>
                <th className="px-4 py-3 font-medium">DNS</th>
                <th className="px-4 py-3 font-medium">SSL</th>
                <th className="px-4 py-3 font-medium">CF</th>
                <th className="px-4 py-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((domain, i) => {
                const sb = statusBadge[domain.status] || { variant: 'default' as const, label: domain.status };
                const tb = typeBadge[domain.type] || { variant: 'info' as const, label: domain.type };
                return (
                  <tr key={domain.id} className={`border-b border-border last:border-b-0 hover:bg-card-hover transition-colors ${i % 2 === 0 ? 'bg-card' : 'bg-stripe'}`}>
                    <td className="px-4 py-3 text-text font-mono text-xs">{domain.domain}</td>
                    <td className="px-4 py-3">
                      <Badge variant={tb.variant}>{tb.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={sb.variant}>{sb.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs">
                      {domain.site?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs font-mono">
                      {domain.dnsResolvesTo || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {domain.sslExpiresAt ? (
                        <span className={new Date(domain.sslExpiresAt) < new Date() ? 'text-danger' : 'text-success'}>
                          {new Date(domain.sslExpiresAt).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-text-secondary">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {domain.cloudflareZone ? (
                        <Badge variant="info">CF</Badge>
                      ) : (
                        <span className="text-text-secondary">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => checkDnsMutation.mutate(domain.id)}
                          className="p-1.5 text-text-secondary hover:text-text rounded-lg hover:bg-card-hover transition-colors"
                          title="Проверить DNS"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${checkDnsMutation.isPending ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => checkSslMutation.mutate(domain.id)}
                          className="p-1.5 text-text-secondary hover:text-text rounded-lg hover:bg-card-hover transition-colors"
                          title="Проверить SSL"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                        </button>
                        {domain.status !== 'ABUSED' ? (
                          <button
                            onClick={() => markAbusedMutation.mutate(domain.id)}
                            className="p-1.5 text-text-secondary hover:text-danger rounded-lg hover:bg-card-hover transition-colors"
                            title="Пометить как абуза"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => restoreMutation.mutate(domain.id)}
                            className="p-1.5 text-text-secondary hover:text-success rounded-lg hover:bg-card-hover transition-colors"
                            title="Восстановить"
                          >
                            <Shield className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteId(domain.id)}
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
      )}

      {/* Add Domain Modal */}
      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); resetForm(); }} title="Добавить домен" maxWidth="max-w-lg">
        <form onSubmit={(e) => { e.preventDefault(); addMutation.mutate(); }} className="space-y-4">
          <Input
            label="Домен"
            value={form.domain}
            onChange={e => setForm({...form, domain: e.target.value})}
            placeholder="example.com"
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-text-secondary">Тип</label>
            <select
              value={form.type}
              onChange={e => setForm({...form, type: e.target.value})}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
            >
              <option value="PRIMARY">Основной</option>
              <option value="SPARE">Запасной</option>
            </select>
          </div>

          <Input
            label="Cloudflare Zone ID"
            value={form.cloudflareZone}
            onChange={e => setForm({...form, cloudflareZone: e.target.value})}
            placeholder="Необязательно"
          />

          <Input
            label="Cloudflare API Token"
            type="password"
            value={form.cloudflareToken}
            onChange={e => setForm({...form, cloudflareToken: e.target.value})}
            placeholder="Необязательно"
          />

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
        title="Удалить домен"
        message="Вы уверены? Домен должен быть отвязан от сайта."
        confirmText="Удалить"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
