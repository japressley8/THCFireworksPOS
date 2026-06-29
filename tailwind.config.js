/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        patriotic: {
          midnight: '#030712', // bg-slate-950 equivalent or darker
          sky: '#090d16',      // custom deep blue-black
          glow: '#172554',     // bg-blue-950 equivalent for glows
          red: {
            light: '#ef4444',
            DEFAULT: '#dc2626', // bg-red-600 firework red
            dark: '#b91c1c',    // bg-red-700
          },
          white: '#f8fafc',    // star white
          gold: {
            light: '#fbbf24',   // text-amber-400
            DEFAULT: '#f59e0b', // sparkling gold/amber
            dark: '#d97706',
          },
          accent: '#3b82f6',   // star blue highlight
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
      },
      boxShadow: {
        'glow-red': '0 0 15px rgba(220, 38, 38, 0.4)',
        'glow-gold': '0 0 15px rgba(245, 158, 11, 0.4)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      }
    },
  },
  plugins: [],
}
