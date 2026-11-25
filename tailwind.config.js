/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        ink: { DEFAULT: '#17212B', soft: '#5B6773' },
        paper: '#F2F4F6',
        line: '#DDE2E7',
        accent: { DEFAULT: '#0E7C66', dark: '#0A5F4E', tint: '#E3F3EF' },
      },
    },
  },
  plugins: [],
};
