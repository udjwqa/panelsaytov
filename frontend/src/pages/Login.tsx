import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'credentials' | 'totp'>('credentials');
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (step === 'credentials') {
        const result = await login(username, password);
        if (result.requireTotp) {
          setStep('totp');
        } else if (result.requireSetup2FA) {
          navigate('/setup-2fa');
        } else {
          navigate('/');
        }
      } else {
        const result = await login(username, password, totpCode);
        if (result.requireSetup2FA) {
          navigate('/setup-2fa');
        } else {
          navigate('/');
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-full max-w-sm mx-4">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Rocket className="w-8 h-8 text-accent" />
          <h1 className="text-2xl font-semibold text-text">Deploy Panel</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {step === 'credentials' ? (
            <>
              <Input
                label="Логин"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Введите логин"
                autoFocus
              />

              <Input
                label="Пароль"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Введите пароль"
              />
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 text-accent mb-2">
                <ShieldCheck className="w-5 h-5" />
                <span className="text-sm font-medium">Двухфакторная аутентификация</span>
              </div>
              <p className="text-xs text-text-secondary text-center">
                Введите 6-значный код из Google Authenticator или резервный код
              </p>
              <Input
                label="Код 2FA"
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="000000"
                autoFocus
                maxLength={8}
              />
              <button
                type="button"
                onClick={() => { setStep('credentials'); setTotpCode(''); setError(''); }}
                className="text-xs text-text-secondary hover:text-text transition-colors"
              >
                Назад к входу
              </button>
            </div>
          )}

          {error && (
            <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" loading={loading}>
            {step === 'credentials' ? 'Войти' : 'Подтвердить'}
          </Button>
        </form>
      </div>
    </div>
  );
}
