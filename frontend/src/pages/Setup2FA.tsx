import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Copy, Check } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import api from '../api/client';
import { useAuthStore } from '../store/authStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

type Step = 'qr' | 'verify' | 'backup';

interface SetupData {
  qrCode: string;
  secret: string;
  backupCodes: string[];
}

export function Setup2FA() {
  const [step, setStep] = useState<Step>('qr');
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifyCode, setVerifyCode] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const { setNeedsSetup2FA } = useAuthStore();
  const navigate = useNavigate();

  // Load QR code on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data } = await api.post('/auth/setup-2fa');
        if (!cancelled) {
          setSetupData(data);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Ошибка загрузки 2FA');
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Confirm 2FA
  const confirmMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/auth/confirm-2fa', { token: verifyCode });
      return data;
    },
    onSuccess: () => {
      setStep('backup');
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Неверный код'),
  });

  const handleVerify = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    confirmMutation.mutate();
  };

  const handleCopyBackupCodes = async () => {
    if (!setupData) return;
    await navigator.clipboard.writeText(setupData.backupCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFinish = () => {
    setNeedsSetup2FA(false);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-full max-w-md mx-4">
        <div className="flex items-center justify-center gap-2 mb-6">
          <ShieldCheck className="w-8 h-8 text-accent" />
          <h1 className="text-xl font-semibold text-text">Настройка 2FA</h1>
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          {step === 'qr' && (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary text-center">
                Отсканируйте QR-код в приложении Google Authenticator
              </p>

              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : setupData ? (
                <>
                  <div className="flex justify-center">
                    <img src={setupData.qrCode} alt="QR Code" className="w-48 h-48 rounded-lg" />
                  </div>

                  <div className="bg-bg rounded-lg p-3">
                    <p className="text-xs text-text-secondary mb-1">Или введите ключ вручную:</p>
                    <code className="text-xs text-accent font-mono break-all">{setupData.secret}</code>
                  </div>

                  <Button onClick={() => setStep('verify')} className="w-full">
                    Далее
                  </Button>
                </>
              ) : null}

              {error && (
                <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg">
                  {error}
                </div>
              )}
            </div>
          )}

          {step === 'verify' && (
            <form onSubmit={handleVerify} className="space-y-4">
              <p className="text-sm text-text-secondary text-center">
                Введите 6-значный код из приложения для подтверждения
              </p>

              <Input
                label="Код подтверждения"
                type="text"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                placeholder="000000"
                autoFocus
                maxLength={6}
              />

              {error && (
                <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="secondary" type="button" onClick={() => { setStep('qr'); setError(''); }} className="flex-1">
                  Назад
                </Button>
                <Button type="submit" loading={confirmMutation.isPending} className="flex-1">
                  Подтвердить
                </Button>
              </div>
            </form>
          )}

          {step === 'backup' && setupData && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 text-success mb-2">
                <Check className="w-5 h-5" />
                <span className="text-sm font-medium">2FA успешно включена!</span>
              </div>

              <p className="text-sm text-text-secondary text-center">
                Сохраните резервные коды в безопасном месте. Они понадобятся, если потеряете доступ к приложению.
              </p>

              <div className="bg-bg rounded-lg p-4">
                <div className="grid grid-cols-2 gap-2">
                  {setupData.backupCodes.map((code, i) => (
                    <code key={i} className="text-sm text-text font-mono text-center py-1 bg-card-hover rounded">
                      {code}
                    </code>
                  ))}
                </div>
              </div>

              <Button
                variant="secondary"
                onClick={handleCopyBackupCodes}
                className="w-full"
              >
                {copied ? (
                  <><Check className="w-4 h-4" /> Скопировано</>
                ) : (
                  <><Copy className="w-4 h-4" /> Копировать коды</>
                )}
              </Button>

              <div className="bg-warning/10 border border-warning/20 rounded-lg p-3">
                <p className="text-xs text-warning font-medium">
                  Каждый резервный код можно использовать только один раз!
                </p>
              </div>

              <Button onClick={handleFinish} className="w-full">
                Готово
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
