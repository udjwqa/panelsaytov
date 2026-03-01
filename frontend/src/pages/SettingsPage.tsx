import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Users, Key, Bell } from 'lucide-react';
import api from '../api/client';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import toast from 'react-hot-toast';

interface User {
  id: string;
  username: string;
  role: string;
  totpEnabled: boolean;
  createdAt: string;
  lastLogin: string | null;
}

type TabKey = 'users' | 'notifications';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('users');
  const [showAddUser, setShowAddUser] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({
    username: '', password: '', role: 'OPERATOR',
  });

  const { data: users, isLoading } = useQuery({
    queryKey: ['settings-users'],
    queryFn: async () => {
      const { data } = await api.get('/settings/users');
      return data.users as User[];
    },
  });

  const addUserMutation = useMutation({
    mutationFn: async () => {
      return api.post('/settings/users', userForm);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-users'] });
      setShowAddUser(false);
      setUserForm({ username: '', password: '', role: 'OPERATOR' });
      toast.success('Пользователь добавлен');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-users'] });
      setDeleteUserId(null);
      toast.success('Пользователь удалён');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Ошибка'),
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-text mb-6">Настройки</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'users'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-secondary hover:text-text'
          }`}
        >
          <Users className="w-4 h-4" />
          Пользователи
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'notifications'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-secondary hover:text-text'
          }`}
        >
          <Bell className="w-4 h-4" />
          Уведомления
        </button>
      </div>

      {activeTab === 'users' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-text">Пользователи</h2>
            <Button onClick={() => setShowAddUser(true)} size="sm">
              <Plus className="w-4 h-4" />
              Добавить
            </Button>
          </div>

          {isLoading ? (
            <div className="text-text-secondary">Загрузка...</div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-text-secondary text-left">
                    <th className="px-4 py-3 font-medium">Логин</th>
                    <th className="px-4 py-3 font-medium">Роль</th>
                    <th className="px-4 py-3 font-medium">2FA</th>
                    <th className="px-4 py-3 font-medium">Создан</th>
                    <th className="px-4 py-3 font-medium">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {(users || []).map((user, i) => (
                    <tr key={user.id} className={`border-b border-border last:border-b-0 hover:bg-card-hover transition-colors ${i % 2 === 0 ? 'bg-card' : 'bg-stripe'}`}>
                      <td className="px-4 py-3 text-text font-medium">{user.username}</td>
                      <td className="px-4 py-3">
                        <Badge variant={user.role === 'ADMIN' ? 'danger' : 'info'}>
                          {user.role === 'ADMIN' ? 'Админ' : 'Оператор'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={user.totpEnabled ? 'success' : 'default'}>
                          {user.totpEnabled ? 'Вкл' : 'Выкл'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-text-secondary text-xs">
                        {new Date(user.createdAt).toLocaleDateString('ru-RU')}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setDeleteUserId(user.id)}
                          className="p-1.5 text-text-secondary hover:text-danger rounded-lg hover:bg-card-hover transition-colors"
                          title="Удалить"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-medium text-text mb-4">Telegram уведомления</h2>
          <p className="text-sm text-text-secondary mb-4">
            Настройте Telegram бота для получения уведомлений о деплоях, мониторинге и паник-кнопке.
          </p>
          <div className="space-y-4 max-w-md">
            <Input label="Bot Token" placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz" />
            <Input label="Chat ID" placeholder="-1001234567890" />
            <Button size="sm">Сохранить</Button>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      <Modal isOpen={showAddUser} onClose={() => setShowAddUser(false)} title="Добавить пользователя" maxWidth="max-w-md">
        <form onSubmit={(e) => { e.preventDefault(); addUserMutation.mutate(); }} className="space-y-4">
          <Input
            label="Логин"
            value={userForm.username}
            onChange={e => setUserForm({...userForm, username: e.target.value})}
            placeholder="operator1"
          />
          <Input
            label="Пароль"
            type="password"
            value={userForm.password}
            onChange={e => setUserForm({...userForm, password: e.target.value})}
            placeholder="Минимум 6 символов"
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-text-secondary">Роль</label>
            <select
              value={userForm.role}
              onChange={e => setUserForm({...userForm, role: e.target.value})}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
            >
              <option value="OPERATOR">Оператор</option>
              <option value="ADMIN">Админ</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowAddUser(false)}>
              Отмена
            </Button>
            <Button type="submit" loading={addUserMutation.isPending}>
              Добавить
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteUserId}
        onClose={() => setDeleteUserId(null)}
        onConfirm={() => deleteUserId && deleteUserMutation.mutate(deleteUserId)}
        title="Удалить пользователя"
        message="Вы уверены? Это действие нельзя отменить."
        confirmText="Удалить"
        loading={deleteUserMutation.isPending}
      />
    </div>
  );
}
