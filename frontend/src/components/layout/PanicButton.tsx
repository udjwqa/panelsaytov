import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import toast from 'react-hot-toast';
import api from '../../api/client';

export function PanicButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handlePanic = async () => {
    setLoading(true);
    try {
      await api.post('/panic');
      toast.success('Аварийное переключение выполнено');
      setIsOpen(false);
    } catch {
      toast.error('Ошибка аварийного переключения');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 bg-danger/10 text-danger text-xs font-medium rounded-lg hover:bg-danger/20 transition-colors duration-150"
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        Паника
      </button>

      <ConfirmDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onConfirm={handlePanic}
        title="Аварийное переключение"
        message="Вы уверены? Все сайты будут переключены на запасные домены и/или серверы. Это действие затронет ВСЕ активные сайты."
        confirmText="Переключить всё"
        confirmVariant="danger"
        loading={loading}
      />
    </>
  );
}
