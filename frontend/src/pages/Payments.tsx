import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  Plus,
  Edit2,
  Trash2,
  Link2,
  Unlink,
  RefreshCw,
  ArrowRightLeft,
  AlertTriangle,
  Check,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { StatusDot } from '../components/ui/StatusDot';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';

/* ──────────── Types ──────────── */

interface PaymentGateway {
  id: string;
  name: string;
  type: string;
  currentUrl: string;
  siteId: string | null;
  site: { id: string; name: string; status: string } | null;
  status: string;
  lastSwitchAt: string | null;
  createdAt: string;
  spareUrls: SpareUrl[];
  linkedSites: LinkedSite[];
}

interface SpareUrl {
  id: string;
  url: string;
}

interface LinkedSite {
  id: string;
  siteId: string;
  envVarName: string;
  lastPropagatedAt: string | null;
  lastPropagateOk: boolean | null;
  site: { id: string; name: string };
}

interface SiteOption {
  id: string;
  name: string;
}

interface SwitchResult {
  propagated: number;
  failed: number;
  errors: Array<{ siteId: string; siteName: string; error: string }>;
  details: Array<{ siteId: string; siteName: string; status: string }>;
}

/* ──────────── Mappings ──────────── */

const statusMap: Record<string, 'online' | 'offline' | 'warning' | 'unknown'> = {
  ACTIVE: 'online',
  INACTIVE: 'unknown',
  SWITCHING: 'warning',
  ERROR: 'offline',
};

const typeLabels: Record<string, { label: string; variant: 'success' | 'info' | 'default' }> = {
  STRIPE: { label: 'Stripe', variant: 'info' },
  PAYPAL: { label: 'PayPal', variant: 'success' },
  CUSTOM: { label: 'Кастом', variant: 'default' },
};

/* ──────────── Helpers ──────────── */

function truncateUrl(url: string, max = 40): string {
  if (url.length <= max) return url;
  return url.slice(0, max - 1) + '\u2026';
}

function formatDate(iso: string | null): string {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ──────────── Component ──────────── */

export function Payments() {
  const queryClient = useQueryClient();

  /* ── Modal states ── */
  const [showAdd, setShowAdd] = useState(false);
  const [editGw, setEditGw] = useState<PaymentGateway | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailGw, setDetailGw] = useState<PaymentGateway | null>(null);
  const [linkGw, setLinkGw] = useState<PaymentGateway | null>(null);
  const [switchGw, setSwitchGw] = useState<PaymentGateway | null>(null);
  const [switchResult, setSwitchResult] = useState<SwitchResult | null>(null);
  const [retryGwId, setRetryGwId] = useState<string | null>(null);

  /* ── Form states ── */
  const [form, setForm] = useState({ name: '', type: 'STRIPE', currentUrl: '', siteId: '' });
  const [spareUrlInput, setSpareUrlInput] = useState('');
  const [linkSiteId, setLinkSiteId] = useState('');
  const [linkEnvVar, setLinkEnvVar] = useState('PAYMENT_URL');
  const [switchMode, setSwitchMode] = useState<'spare' | 'custom'>('spare');
  const [switchSpareId, setSwitchSpareId] = useState('');
  const [switchCustomUrl, setSwitchCustomUrl] = useState('');

  /* ──────────── Queries ──────────── */

  const { data, isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: async () => {
      const { data } = await api.get('/payments');
      return data.gateways as PaymentGateway[];
    },
  });

  const { data: sitesData } = useQuery({
    queryKey: ['sites'],
    queryFn: async () => {
      const { data } = await api.get('/sites');
      return data.sites as SiteOption[];
    },
  });

  const gateways = data || [];
  const sites = sitesData || [];

  /* ──────────── Mutations ──────────── */

  const addMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: form.name,
        type: form.type,
        currentUrl: form.currentUrl,
      };
      if (form.siteId) payload.siteId = form.siteId;
      return api.post('/payments', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setShowAdd(false);
      resetForm();
      toast.success('Платёжка добавлена');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editGw) return;
      return api.put(`/payments/${editGw.id}`, {
        name: form.name,
        type: form.type,
        currentUrl: form.currentUrl,
        siteId: form.siteId || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setEditGw(null);
      resetForm();
      toast.success('Платёжка обновлена');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/payments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setDeleteId(null);
      toast.success('Платёжка удалена');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  const addSpareUrlMutation = useMutation({
    mutationFn: async (gwId: string) => {
      return api.post(`/payments/${gwId}/spare-urls`, { url: spareUrlInput });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setSpareUrlInput('');
      toast.success('Запасной URL добавлен');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  const deleteSpareUrlMutation = useMutation({
    mutationFn: ({ gwId, urlId }: { gwId: string; urlId: string }) =>
      api.delete(`/payments/${gwId}/spare-urls/${urlId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Запасной URL удалён');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  const linkSiteMutation = useMutation({
    mutationFn: async () => {
      if (!linkGw) return;
      return api.post(`/payments/${linkGw.id}/link`, {
        siteId: linkSiteId,
        envVarName: linkEnvVar,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setLinkGw(null);
      setLinkSiteId('');
      setLinkEnvVar('PAYMENT_URL');
      toast.success('Сайт привязан');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  const unlinkSiteMutation = useMutation({
    mutationFn: ({ gwId, siteId }: { gwId: string; siteId: string }) =>
      api.delete(`/payments/${gwId}/link/${siteId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Сайт отвязан');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  const switchUrlMutation = useMutation({
    mutationFn: async () => {
      if (!switchGw) return;
      const newUrl =
        switchMode === 'spare'
          ? switchGw.spareUrls.find((s) => s.id === switchSpareId)?.url
          : switchCustomUrl;
      if (!newUrl) throw new Error('URL не указан');
      const { data } = await api.post(`/payments/${switchGw.id}/switch-url`, { newUrl });
      return data as SwitchResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      if (result) {
        setSwitchResult(result);
        toast.success(`URL переключён. Обновлено сайтов: ${result.propagated}`);
        if (result.failed > 0) {
          toast.error(`Не удалось обновить: ${result.failed}`);
        }
      }
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  const retryPropagationMutation = useMutation({
    mutationFn: async (gwId: string) => {
      const { data } = await api.post(`/payments/${gwId}/retry-propagation`);
      return data as SwitchResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      if (result) {
        setSwitchResult(result);
        toast.success(`Повтор завершён. Обновлено: ${result.propagated}`);
      }
      setRetryGwId(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Ошибка');
      setRetryGwId(null);
    },
  });

  /* ──────────── Helpers ──────────── */

  function resetForm() {
    setForm({ name: '', type: 'STRIPE', currentUrl: '', siteId: '' });
  }

  function openEdit(gw: PaymentGateway) {
    setForm({
      name: gw.name,
      type: gw.type,
      currentUrl: gw.currentUrl,
      siteId: gw.siteId || '',
    });
    setEditGw(gw);
  }

  function openDetail(gw: PaymentGateway) {
    setSpareUrlInput('');
    setDetailGw(gw);
  }

  function openSwitch(gw: PaymentGateway) {
    setSwitchMode('spare');
    setSwitchSpareId(gw.spareUrls[0]?.id || '');
    setSwitchCustomUrl('');
    setSwitchResult(null);
    setSwitchGw(gw);
  }

  function closeSwitch() {
    setSwitchGw(null);
    setSwitchResult(null);
    setSwitchSpareId('');
    setSwitchCustomUrl('');
  }

  /* ──────────── Fresh gateway for modals ──────────── */

  function freshGw(id: string): PaymentGateway | undefined {
    return gateways.find((g) => g.id === id);
  }

  // Keep detail modal in sync after mutations
  const activeDetail = detailGw ? freshGw(detailGw.id) || detailGw : null;
  const activeSwitch = switchGw ? freshGw(switchGw.id) || switchGw : null;

  /* ──────────── Render ──────────── */

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Платёжки</h1>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4" />
          Добавить
        </Button>
      </div>

      {/* Table / Empty */}
      {isLoading ? (
        <div className="text-text-secondary">Загрузка...</div>
      ) : gateways.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Платёжных шлюзов пока нет</p>
          <p className="text-sm mt-1">Добавьте первый шлюз для начала работы</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-card text-text-secondary text-xs uppercase tracking-wider text-left">
                <th className="px-4 py-3 font-medium w-8"></th>
                <th className="px-4 py-3 font-medium">Название</th>
                <th className="px-4 py-3 font-medium">Тип</th>
                <th className="px-4 py-3 font-medium">Текущий URL</th>
                <th className="px-4 py-3 font-medium">Сайты</th>
                <th className="px-4 py-3 font-medium">Запасные</th>
                <th className="px-4 py-3 font-medium">Последний свитч</th>
                <th className="px-4 py-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {gateways.map((gw, i) => {
                const typeMeta = typeLabels[gw.type] || {
                  label: gw.type,
                  variant: 'default' as const,
                };
                return (
                  <tr
                    key={gw.id}
                    className={`border-b border-border last:border-b-0 hover:bg-card-hover transition-colors ${
                      i % 2 === 0 ? 'bg-card' : 'bg-stripe'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <StatusDot status={statusMap[gw.status] || 'unknown'} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-text font-medium">{gw.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={typeMeta.variant}>{typeMeta.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-text-secondary text-xs font-mono"
                        title={gw.currentUrl}
                      >
                        {truncateUrl(gw.currentUrl)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {gw.linkedSites.length}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {gw.spareUrls.length}
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs">
                      {formatDate(gw.lastSwitchAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openDetail(gw)}
                          className="p-1.5 text-text-secondary hover:text-text rounded-lg hover:bg-card-hover transition-colors"
                          title="Подробности"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openEdit(gw)}
                          className="p-1.5 text-text-secondary hover:text-text rounded-lg hover:bg-card-hover transition-colors"
                          title="Редактировать"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setLinkSiteId('');
                            setLinkEnvVar('PAYMENT_URL');
                            setLinkGw(gw);
                          }}
                          className="p-1.5 text-text-secondary hover:text-accent rounded-lg hover:bg-card-hover transition-colors"
                          title="Привязать сайт"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openSwitch(gw)}
                          className="p-1.5 text-text-secondary hover:text-accent rounded-lg hover:bg-card-hover transition-colors"
                          title="Переключить URL"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setRetryGwId(gw.id);
                            retryPropagationMutation.mutate(gw.id);
                          }}
                          className="p-1.5 text-text-secondary hover:text-accent rounded-lg hover:bg-card-hover transition-colors"
                          title="Повторить пропагацию"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${
                              retryGwId === gw.id && retryPropagationMutation.isPending
                                ? 'animate-spin'
                                : ''
                            }`}
                          />
                        </button>
                        <button
                          onClick={() => setDeleteId(gw.id)}
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

      {/* ═══════════ Add / Edit Modal ═══════════ */}
      <Modal
        isOpen={showAdd || !!editGw}
        onClose={() => {
          setShowAdd(false);
          setEditGw(null);
          resetForm();
        }}
        title={editGw ? 'Редактировать платёжку' : 'Добавить платёжку'}
        maxWidth="max-w-lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            editGw ? updateMutation.mutate() : addMutation.mutate();
          }}
          className="space-y-4"
        >
          <Input
            label="Название"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Основной Stripe"
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-text-secondary">Тип</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
            >
              <option value="STRIPE">Stripe</option>
              <option value="PAYPAL">PayPal</option>
              <option value="CUSTOM">Кастом</option>
            </select>
          </div>

          <Input
            label="Текущий URL"
            value={form.currentUrl}
            onChange={(e) => setForm({ ...form, currentUrl: e.target.value })}
            placeholder="https://api.stripe.com/v1"
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-text-secondary">Привязать к сайту (опционально)</label>
            <select
              value={form.siteId}
              onChange={(e) => setForm({ ...form, siteId: e.target.value })}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
            >
              <option value="">Без привязки</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setShowAdd(false);
                setEditGw(null);
                resetForm();
              }}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              loading={addMutation.isPending || updateMutation.isPending}
            >
              {editGw ? 'Сохранить' : 'Добавить'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ═══════════ Detail Modal (Spare URLs + Linked Sites) ═══════════ */}
      <Modal
        isOpen={!!activeDetail}
        onClose={() => setDetailGw(null)}
        title={`Шлюз: ${activeDetail?.name || ''}`}
        maxWidth="max-w-2xl"
      >
        {activeDetail && (
          <div className="space-y-6">
            {/* Info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-text-secondary">Тип: </span>
                <Badge variant={typeLabels[activeDetail.type]?.variant || 'default'}>
                  {typeLabels[activeDetail.type]?.label || activeDetail.type}
                </Badge>
              </div>
              <div>
                <span className="text-text-secondary">Статус: </span>
                <StatusDot status={statusMap[activeDetail.status] || 'unknown'} size="sm" />
                <span className="text-text ml-1.5">{activeDetail.status}</span>
              </div>
              <div className="col-span-2">
                <span className="text-text-secondary">Текущий URL: </span>
                <span className="text-text text-xs font-mono break-all">
                  {activeDetail.currentUrl}
                </span>
              </div>
            </div>

            {/* Spare URLs */}
            <div>
              <h3 className="text-sm font-medium text-text mb-2">
                Запасные URL ({activeDetail.spareUrls.length})
              </h3>
              {activeDetail.spareUrls.length > 0 ? (
                <div className="space-y-1.5">
                  {activeDetail.spareUrls.map((su) => (
                    <div
                      key={su.id}
                      className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2"
                    >
                      <span className="text-text-secondary text-xs font-mono break-all">
                        {su.url}
                      </span>
                      <button
                        onClick={() =>
                          deleteSpareUrlMutation.mutate({
                            gwId: activeDetail.id,
                            urlId: su.id,
                          })
                        }
                        className="p-1 text-text-secondary hover:text-danger rounded transition-colors ml-2 shrink-0"
                        title="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-text-secondary text-xs">Нет запасных URL</p>
              )}

              <div className="flex gap-2 mt-2">
                <Input
                  value={spareUrlInput}
                  onChange={(e) => setSpareUrlInput(e.target.value)}
                  placeholder="https://spare-payment-url.com"
                  className="flex-1"
                />
                <Button
                  size="sm"
                  disabled={!spareUrlInput.trim()}
                  loading={addSpareUrlMutation.isPending}
                  onClick={() => addSpareUrlMutation.mutate(activeDetail.id)}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Добавить
                </Button>
              </div>
            </div>

            {/* Linked Sites */}
            <div>
              <h3 className="text-sm font-medium text-text mb-2">
                Привязанные сайты ({activeDetail.linkedSites.length})
              </h3>
              {activeDetail.linkedSites.length > 0 ? (
                <div className="space-y-1.5">
                  {activeDetail.linkedSites.map((ls) => (
                    <div
                      key={ls.id}
                      className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2"
                    >
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-text font-medium">{ls.site.name}</span>
                        <span className="text-text-secondary text-xs font-mono">
                          {ls.envVarName}
                        </span>
                        {ls.lastPropagateOk === true && (
                          <Check className="w-3.5 h-3.5 text-success" />
                        )}
                        {ls.lastPropagateOk === false && (
                          <X className="w-3.5 h-3.5 text-danger" />
                        )}
                        {ls.lastPropagatedAt && (
                          <span className="text-text-secondary text-xs">
                            {formatDate(ls.lastPropagatedAt)}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() =>
                          unlinkSiteMutation.mutate({
                            gwId: activeDetail.id,
                            siteId: ls.siteId,
                          })
                        }
                        className="p-1 text-text-secondary hover:text-danger rounded transition-colors ml-2 shrink-0"
                        title="Отвязать"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-text-secondary text-xs">Нет привязанных сайтов</p>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setDetailGw(null)}>
                Закрыть
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══════════ Link Site Modal ═══════════ */}
      <Modal
        isOpen={!!linkGw}
        onClose={() => {
          setLinkGw(null);
          setLinkSiteId('');
          setLinkEnvVar('PAYMENT_URL');
        }}
        title={`Привязать сайт к: ${linkGw?.name || ''}`}
        maxWidth="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            linkSiteMutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-text-secondary">Сайт</label>
            <select
              value={linkSiteId}
              onChange={(e) => setLinkSiteId(e.target.value)}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
            >
              <option value="">Выберите сайт</option>
              {sites
                .filter(
                  (s) => !linkGw?.linkedSites.some((ls) => ls.siteId === s.id)
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>

          <Input
            label="Переменная окружения"
            value={linkEnvVar}
            onChange={(e) => setLinkEnvVar(e.target.value)}
            placeholder="PAYMENT_URL"
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setLinkGw(null);
                setLinkSiteId('');
                setLinkEnvVar('PAYMENT_URL');
              }}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={!linkSiteId}
              loading={linkSiteMutation.isPending}
            >
              <Link2 className="w-4 h-4" />
              Привязать
            </Button>
          </div>
        </form>
      </Modal>

      {/* ═══════════ Switch URL Modal ═══════════ */}
      <Modal
        isOpen={!!activeSwitch}
        onClose={closeSwitch}
        title={`Переключить URL: ${activeSwitch?.name || ''}`}
        maxWidth="max-w-lg"
      >
        {activeSwitch && !switchResult && (
          <div className="space-y-4">
            {/* Current URL */}
            <div>
              <span className="text-sm text-text-secondary">Текущий URL:</span>
              <div className="mt-1 px-3 py-2 bg-card border border-border rounded-lg text-text text-xs font-mono break-all">
                {activeSwitch.currentUrl}
              </div>
            </div>

            {/* Source selection */}
            <div className="space-y-3">
              <label className="text-sm text-text-secondary">Новый URL</label>

              {/* Radio: spare */}
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="switchMode"
                  checked={switchMode === 'spare'}
                  onChange={() => setSwitchMode('spare')}
                  className="mt-1"
                />
                <div className="flex-1">
                  <span className="text-sm text-text">Из запасных</span>
                  {switchMode === 'spare' && (
                    <select
                      value={switchSpareId}
                      onChange={(e) => setSwitchSpareId(e.target.value)}
                      className="w-full mt-1.5 px-3 py-2 bg-card border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
                    >
                      {activeSwitch.spareUrls.length === 0 ? (
                        <option value="">Нет запасных URL</option>
                      ) : (
                        activeSwitch.spareUrls.map((su) => (
                          <option key={su.id} value={su.id}>
                            {su.url}
                          </option>
                        ))
                      )}
                    </select>
                  )}
                </div>
              </label>

              {/* Radio: custom */}
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="switchMode"
                  checked={switchMode === 'custom'}
                  onChange={() => setSwitchMode('custom')}
                  className="mt-1"
                />
                <div className="flex-1">
                  <span className="text-sm text-text">Свой URL</span>
                  {switchMode === 'custom' && (
                    <input
                      type="text"
                      value={switchCustomUrl}
                      onChange={(e) => setSwitchCustomUrl(e.target.value)}
                      placeholder="https://new-payment-url.com"
                      className="w-full mt-1.5 px-3 py-2 bg-card border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
                    />
                  )}
                </div>
              </label>
            </div>

            {/* Warning */}
            {activeSwitch.linkedSites.length > 0 && (
              <div className="flex items-start gap-2 p-3 bg-warning/10 border border-warning/20 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-warning font-medium">
                    Будет обновлено {activeSwitch.linkedSites.length}{' '}
                    {activeSwitch.linkedSites.length === 1
                      ? 'сайт'
                      : activeSwitch.linkedSites.length < 5
                        ? 'сайта'
                        : 'сайтов'}
                    :
                  </p>
                  <ul className="mt-1 text-text-secondary text-xs space-y-0.5">
                    {activeSwitch.linkedSites.map((ls) => (
                      <li key={ls.id}>
                        {ls.site.name}{' '}
                        <span className="font-mono text-text-secondary/70">
                          ({ls.envVarName})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={closeSwitch}>
                Отмена
              </Button>
              <Button
                variant="danger"
                onClick={() => switchUrlMutation.mutate()}
                loading={switchUrlMutation.isPending}
                disabled={
                  (switchMode === 'spare' && !switchSpareId) ||
                  (switchMode === 'custom' && !switchCustomUrl.trim())
                }
              >
                <ArrowRightLeft className="w-4 h-4" />
                Переключить
              </Button>
            </div>
          </div>
        )}

        {/* Switch Results */}
        {activeSwitch && switchResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm">
                <Check className="w-4 h-4 text-success" />
                <span className="text-text">Обновлено: {switchResult.propagated}</span>
              </div>
              {switchResult.failed > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <X className="w-4 h-4 text-danger" />
                  <span className="text-text">Ошибки: {switchResult.failed}</span>
                </div>
              )}
            </div>

            {switchResult.details.length > 0 && (
              <div className="space-y-1.5">
                {switchResult.details.map((d, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2 text-sm"
                  >
                    <span className="text-text">{d.siteName}</span>
                    {d.status === 'ok' ? (
                      <Badge variant="success">OK</Badge>
                    ) : (
                      <Badge variant="danger">Ошибка</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}

            {switchResult.errors.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-sm text-danger font-medium">Ошибки:</h4>
                {switchResult.errors.map((e, idx) => (
                  <div
                    key={idx}
                    className="bg-danger/5 border border-danger/20 rounded-lg px-3 py-2 text-xs"
                  >
                    <span className="text-text font-medium">{e.siteName}: </span>
                    <span className="text-danger">{e.error}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              {switchResult.failed > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSwitchResult(null);
                    retryPropagationMutation.mutate(activeSwitch.id);
                  }}
                  loading={retryPropagationMutation.isPending}
                >
                  <RefreshCw className="w-4 h-4" />
                  Повторить
                </Button>
              )}
              <Button onClick={closeSwitch}>Закрыть</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══════════ Delete Confirmation ═══════════ */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Удалить платёжку"
        message="Вы уверены? Все запасные URL и привязки к сайтам будут удалены."
        confirmText="Удалить"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
