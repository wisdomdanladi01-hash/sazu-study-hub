import type { ReactNode } from 'react';

type Tone = 'info' | 'success' | 'warning' | 'error';

const tones: Record<Tone, { wrap: string; title: string }> = {
  info: { wrap: 'bg-blue-50 border-blue-200 text-blue-900', title: 'text-blue-900' },
  success: { wrap: 'bg-green-50 border-green-200 text-green-900', title: 'text-green-900' },
  warning: { wrap: 'bg-amber-50 border-amber-200 text-amber-900', title: 'text-amber-900' },
  error: { wrap: 'bg-red-50 border-red-200 text-red-900', title: 'text-red-900' },
};

export function Alert({
  tone = 'info',
  title,
  children,
  className = '',
  onClose,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
  onClose?: () => void;
}) {
  return (
    <div className={`relative rounded-xl border px-4 py-3 ${tones[tone].wrap} ${className}`}>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2.5 right-2.5 text-current opacity-60 hover:opacity-100 transition-opacity p-1 rounded-lg"
          aria-label="Dismiss alert"
        >
          <span className="sr-only">Close</span>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {title && <p className={`font-semibold text-sm ${tones[tone].title} ${onClose ? 'pr-6' : ''}`}>{title}</p>}
      {children && <div className={`text-sm ${title ? 'mt-1' : ''} ${onClose ? 'pr-6' : ''} opacity-90`}>{children}</div>}
    </div>
  );
}
