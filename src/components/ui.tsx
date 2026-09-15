import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';

export function Button({
  className,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-slate-900 text-white shadow-sm hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200',
        variant === 'secondary' && 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
        variant === 'danger' && 'border border-red-200 bg-white text-red-600 hover:bg-red-50 dark:border-red-900 dark:bg-slate-800',
        className,
      )}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/80', className)}>
      {children}
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-slate-900 transition-all dark:bg-white" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Slider(props: InputHTMLAttributes<HTMLInputElement> & { label: string; valueText: string }) {
  const { label, valueText, className, ...rest } = props;
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
        <span className="tabular-nums text-slate-500 dark:text-slate-400">{valueText}</span>
      </span>
      <input type="range" {...rest} className="w-full accent-slate-900 dark:accent-white" />
    </label>
  );
}

export function Empty({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-600">
      <p className="font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">{hint}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
