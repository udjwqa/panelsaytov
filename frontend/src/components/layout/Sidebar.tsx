import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Server,
  Globe,
  Link,
  Rocket,
  Activity,
  FileText,
  Settings,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Дашборд' },
  { to: '/servers', icon: Server, label: 'Серверы' },
  { to: '/sites', icon: Globe, label: 'Сайты' },
  { to: '/domains', icon: Link, label: 'Домены' },
  { to: '/deploy', icon: Rocket, label: 'Деплой' },
  { to: '/monitoring', icon: Activity, label: 'Мониторинг' },
  { to: '/logs', icon: FileText, label: 'Логи' },
  { to: '/settings', icon: Settings, label: 'Настройки' },
];

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-bg border-r border-border flex flex-col z-30">
      <div className="h-14 flex items-center px-5 border-b border-border">
        <Rocket className="w-5 h-5 text-accent mr-2" />
        <span className="text-base font-semibold text-text">Deploy Panel</span>
      </div>

      <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-150 ${
                isActive
                  ? 'bg-card-hover text-text'
                  : 'text-text-secondary hover:text-text hover:bg-card-hover/50'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
