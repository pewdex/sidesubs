import type { IconName } from './types';

export function Icon({ name }: { name: IconName }) {
  const commonProps = {
    'aria-hidden': true,
    fill: 'none',
    height: 20,
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 2,
    viewBox: '0 0 24 24',
    width: 20,
  };

  if (name === 'menu') {
    return (
      <svg {...commonProps}>
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h16" />
      </svg>
    );
  }

  if (name === 'reset') {
    return (
      <svg {...commonProps}>
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10a6 6 0 1 1-4.2 10.3" />
      </svg>
    );
  }

  if (name === 'refresh') {
    return (
      <svg {...commonProps}>
        <path d="M20 11a8.1 8.1 0 0 0-15.5-2m-.5-4v4h4" />
        <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
      </svg>
    );
  }

  if (name === 'upload') {
    return (
      <svg {...commonProps}>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M5 20h14" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <circle cx="11" cy="11" r="7" />
      <path d="m16 16 4 4" />
    </svg>
  );
}
