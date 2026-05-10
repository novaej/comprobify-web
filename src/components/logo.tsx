import type { SVGProps } from 'react';

type Variant = 'dark' | 'light';

interface LogoProps extends SVGProps<SVGSVGElement> {
  variant?: Variant;
}

const colors = {
  dark: {
    arc: '#F7F4EE',
    bolt: '#2DD4BF',
    boltStroke: '#0B1220',
    wordPrimary: '#F7F4EE',
    wordAccent: '#2DD4BF',
  },
  light: {
    arc: '#0E1116',
    bolt: '#0F766E',
    boltStroke: '#F7F4EE',
    wordPrimary: '#0E1116',
    wordAccent: '#0F766E',
  },
};

/** Square icon mark — use at any size by setting className="h-* w-*" */
export function Logomark({ variant = 'light', className, ...props }: LogoProps) {
  const c = colors[variant];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 120"
      role="img"
      aria-label="Comprobify"
      className={className}
      {...props}
    >
      <title>Comprobify</title>
      <path
        d="M 88 30 A 32 32 0 1 0 88 90"
        stroke={c.arc}
        strokeWidth="16"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 104 28 L 58 58 L 74 58 L 52 100 L 78 64 L 62 64 Z"
        fill={c.bolt}
        stroke={c.boltStroke}
        strokeWidth="6"
        strokeLinejoin="round"
        style={{ paintOrder: 'stroke fill' }}
      />
    </svg>
  );
}

/** Horizontal lockup — icon + "Comprobify" wordmark side by side */
export function LogoLockup({ variant = 'light', className, ...props }: LogoProps) {
  const c = colors[variant];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 660 120"
      role="img"
      aria-label="Comprobify"
      className={className}
      {...props}
    >
      <title>Comprobify</title>
      <g>
        <path
          d="M 88 30 A 32 32 0 1 0 88 90"
          stroke={c.arc}
          strokeWidth="16"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 104 28 L 58 58 L 74 58 L 52 100 L 78 64 L 62 64 Z"
          fill={c.bolt}
          stroke={c.boltStroke}
          strokeWidth="6"
          strokeLinejoin="round"
          style={{ paintOrder: 'stroke fill' }}
        />
      </g>
      <text
        x="140"
        y="86"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
        fontWeight="700"
        fontSize="72"
        letterSpacing="-2"
      >
        <tspan fill={c.wordPrimary}>Compro</tspan>
        <tspan fill={c.wordAccent}>bify</tspan>
      </text>
    </svg>
  );
}
