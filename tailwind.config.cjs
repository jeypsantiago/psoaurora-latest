module.exports = {
      darkMode: 'class',
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './constants/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
  ],
  safelist: [
    ...['blue', 'emerald', 'amber', 'slate', 'indigo'].flatMap((color) => [
      `bg-${color}-50`,
      `border-${color}-100`,
      `border-${color}-200`,
      `text-${color}-400`,
      `text-${color}-500`,
      `text-${color}-700`,
      `dark:bg-${color}-500/10`,
      `dark:bg-${color}-900/20`,
      `dark:border-${color}-500/20`,
      `dark:border-${color}-800`,
      `dark:text-${color}-400`,
    ]),
  ],
  theme: {
        extend: {
          fontFamily: {
            sans: ['"Source Sans 3"', '"Manrope"', 'system-ui', 'sans-serif'],
            display: ['"Manrope"', '"Source Sans 3"', 'system-ui', 'sans-serif'],
            serif: ['Merriweather', 'Georgia', 'serif'],
            mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
          },
          colors: {
            psa: {
              blue: '#0056b3',
              yellow: '#ffc107',
              red: '#CE1126',
              navy: '#003366',
              surface: '#f6f9fc',
              surfaceAlt: '#eef4fa',
              mist: '#e7eef6',
              line: '#d3dfec',
              ink: '#1d2a3b',
              success: '#0f766e',
            },
            cbms: {
              bg: '#1A1C23',
              footer: '#23252E',
              teal: '#0D7685',
              tealGlow: '#095C68',
              orange: '#D97736',
              slate: '#323743',
            },
            zinc: {
              950: '#09090b',
              900: '#18181b',
              800: '#27272a',
            }
          },
          keyframes: {
            float: {
              '0%, 100%': { transform: 'translateY(0) scale(1)' },
              '50%': { transform: 'translateY(-30px) scale(1.05)' },
            },
            'float-reverse': {
              '0%, 100%': { transform: 'translateY(0) scale(1.05)' },
              '50%': { transform: 'translateY(30px) scale(1)' },
            },
            shimmer: {
              '100%': { transform: 'translateX(100%)' },
            },
            'background-shift': {
              '0%': { 'background-position': '0% 50%' },
              '50%': { 'background-position': '100% 50%' },
              '100%': { 'background-position': '0% 50%' },
            },
            reveal: {
              '0%': { opacity: '0', transform: 'translateY(20px) scale(0.98)' },
              '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
            },
            'reveal-left': {
              '0%': { opacity: '0', transform: 'translateX(-40px)' },
              '100%': { opacity: '1', transform: 'translateX(0)' },
            },
            'reveal-right': {
              '0%': { opacity: '0', transform: 'translateX(40px)' },
              '100%': { opacity: '1', transform: 'translateX(0)' },
            },
            marquee: {
              '0%': { transform: 'translateX(0)' },
              '100%': { transform: 'translateX(-50%)' },
            },
            'card-entrance': {
              '0%': { opacity: '0', transform: 'translateY(30px) scale(0.95)' },
              '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
            },
            'gradient-shift': {
              '0%': { 'background-position': '0% 50%' },
              '50%': { 'background-position': '100% 50%' },
              '100%': { 'background-position': '0% 50%' },
            },
            'glow-pulse': {
              '0%, 100%': { 'box-shadow': '0 0 5px rgba(0,86,179,0.1)' },
              '50%': { 'box-shadow': '0 0 25px rgba(0,86,179,0.15)' },
            },
            'bounce-scroll': {
              '0%, 100%': { transform: 'translateY(0)', opacity: '1' },
              '50%': { transform: 'translateY(8px)', opacity: '0.5' },
            },
            'slide-up': {
              '0%': { opacity: '0', transform: 'translateY(40px)' },
              '100%': { opacity: '1', transform: 'translateY(0)' },
            },
            'slide-in-left': {
              '0%': { opacity: '0', transform: 'translateX(-50vw)' },
              '100%': { opacity: '1', transform: 'translateX(0)' },
            },
            'slide-in-right': {
              '0%': { opacity: '0', transform: 'translateX(50vw)' },
              '100%': { opacity: '1', transform: 'translateX(0)' },
            },
            'text-shimmer': {
              '0%': { 'background-position': '-200% center' },
              '100%': { 'background-position': '200% center' },
            },
            'bar-fill': {
              '0%': { width: '0%' },
              '100%': { width: 'var(--bar-width)' },
            },
            'counter-up': {
              '0%': { opacity: '0', transform: 'translateY(10px)' },
              '100%': { opacity: '1', transform: 'translateY(0)' },
            }
          },
          animation: {
            'pulse-slow': 'pulse 8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            'float': 'float 10s ease-in-out infinite',
            'float-reverse': 'float-reverse 12s ease-in-out infinite',
            'shimmer': 'shimmer 2.5s infinite',
            'background-shift': 'background-shift 15s ease infinite',
            'reveal': 'reveal 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            'reveal-left': 'reveal-left 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            'reveal-right': 'reveal-right 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            'slide-in-left': 'slide-in-left 4.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            'slide-in-right': 'slide-in-right 4.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            'marquee': 'marquee 25s linear infinite',
            'spin-slow': 'spin 12s linear infinite',
            'card-entrance': 'card-entrance 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            'gradient-shift': 'gradient-shift 8s ease-in-out infinite',
            'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
            'bounce-scroll': 'bounce-scroll 2s ease-in-out infinite',
            'slide-up': 'slide-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            'text-shimmer': 'text-shimmer 4s ease-in-out infinite',
            'bar-fill': 'bar-fill 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            'counter-up': 'counter-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          },
          screens: {
            'xs': '475px',
          }
        },
      },
    };
