/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  // Gate every hover:/group-hover: rule behind `@media (hover: hover)`. A
  // phone has no hover, so those rules only ever cost paint work during scroll
  // (and leave hover states stuck on after a tap).
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      colors: {
        base: '#0b0e14',
        surface: '#151a23',
        border: '#28303c',
        primary: {
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
    },
  },
  plugins: [],
};
