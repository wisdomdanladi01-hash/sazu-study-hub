import { Link } from 'react-router-dom';

export function BrandMark({ size = 'md', to = '/' }: { size?: 'sm' | 'md' | 'lg'; to?: string }) {
  const sizes = {
    sm: { mark: 'h-7 w-7', title: 'text-base', sub: 'text-[0.625rem]' },
    md: { mark: 'h-9 w-9', title: 'text-lg', sub: 'text-[0.6875rem]' },
    lg: { mark: 'h-12 w-12', title: 'text-2xl', sub: 'text-xs' },
  }[size];

  return (
    <Link to={to} className="inline-flex items-center gap-2.5 group" aria-label="SAZU Study Hub home">
      <span className={`inline-flex ${sizes.mark} items-center justify-center rounded-lg bg-ink-950 text-teal-300 shadow-soft transition-transform group-hover:scale-[1.04]`}>
        <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="none" aria-hidden>
          <path d="M5 16 L12 6 L19 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 16 L12 10 L16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span className={`font-display font-extrabold ${sizes.title} text-ink-950 tracking-tight`}>
          SAZU <span className="text-teal-600">Study Hub</span>
        </span>
      </span>
    </Link>
  );
}
