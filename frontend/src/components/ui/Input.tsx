import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-sm text-text-secondary">{label}</label>
        )}
        <input
          ref={ref}
          className={`w-full px-3 py-2 bg-card border border-border rounded-lg text-text text-sm placeholder:text-text-secondary/50 focus:outline-none focus:border-accent transition-colors duration-150 ${error ? 'border-danger' : ''} ${className}`}
          {...props}
        />
        {error && (
          <span className="text-xs text-danger">{error}</span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
