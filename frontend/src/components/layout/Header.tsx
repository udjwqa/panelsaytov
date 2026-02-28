import { useState, useRef, useEffect } from 'react';
import { Bell, ChevronDown, LogOut, User } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { PanicButton } from './PanicButton';

export function Header() {
  const { user, logout } = useAuthStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-20 h-14 bg-bg border-b border-border flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <span className="text-sm text-text-secondary">
          0/0 сайтов онлайн
        </span>
      </div>

      <div className="flex items-center gap-3">
        <PanicButton />

        <button className="relative p-2 text-text-secondary hover:text-text rounded-lg hover:bg-card-hover transition-colors">
          <Bell className="w-4 h-4" />
        </button>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-card-hover transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-accent" />
            </div>
            <span className="text-sm text-text">{user?.username}</span>
            <span className="text-xs text-text-secondary">{user?.role === 'ADMIN' ? 'Админ' : 'Оператор'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-text-secondary" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-xl py-1 z-50">
              <button
                onClick={() => {
                  logout();
                  setDropdownOpen(false);
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:text-text hover:bg-card-hover transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Выйти
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
