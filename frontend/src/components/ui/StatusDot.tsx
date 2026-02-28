interface StatusDotProps {
  status: 'online' | 'offline' | 'warning' | 'unknown';
  size?: 'sm' | 'md';
}

const colors = {
  online: 'bg-success shadow-[0_0_6px_rgba(34,197,94,0.4)]',
  offline: 'bg-danger shadow-[0_0_6px_rgba(239,68,68,0.4)]',
  warning: 'bg-warning shadow-[0_0_6px_rgba(245,158,11,0.4)]',
  unknown: 'bg-text-secondary',
};

const sizes = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
};

export function StatusDot({ status, size = 'md' }: StatusDotProps) {
  return (
    <span className={`inline-block rounded-full ${colors[status]} ${sizes[size]}`} />
  );
}
