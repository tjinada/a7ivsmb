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
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      colors: {
        // Neutral (not blue-tinted) greys so photos aren't colour-cast by the
        // chrome. Same values the client share page uses.
        base: '#121212',
        surface: '#1c1c1c',
        border: '#2a2a2a',
        'border-strong': '#3a3a3a',
        // Amber accent: the only colour in the UI besides the photos.
        primary: {
          300: '#efc77a',
          400: '#e9b457',
          500: '#E3A33B',
          600: '#d4942f',
          700: '#b87d24',
        },
        // Text/icon colour on top of a primary-filled control.
        'on-accent': '#121212',
        // Override Tailwind's cool gray with a true neutral ramp.
        gray: {
          50: '#fafafa',
          100: '#ededed',
          200: '#d4d4d4',
          300: '#b5b5b5',
          400: '#a3a3a3',
          500: '#8a8a8a',
          600: '#6f6f6f',
          700: '#4a4a4a',
          800: '#2a2a2a',
          900: '#1c1c1c',
          950: '#121212',
        },
      },
    },
  },
  plugins: [],
};
