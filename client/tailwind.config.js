/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      keyframes: {
        'pulse-ring': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(74, 222, 128, 0)' },
          '50%':       { boxShadow: '0 0 0 3px rgba(74, 222, 128, 0.35)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 2s ease-in-out infinite',
      },
      colors: {
        timber: '#2d6a2d',
        clay: '#c1440e',
        iron: '#708090',
        grain: '#d4a017',
        wool: '#7ec850',
        desert: '#d2b48c',
        ocean: '#1a6896',
      },
    },
  },
  plugins: [],
};
