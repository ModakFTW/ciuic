/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: '#0A0B0D',
        surface: {
          DEFAULT: '#111317',
          elevated: '#171A1F',
          hover: '#20232B',
          subtle: '#14161B',
        },
        border: {
          subtle: '#22252B',
          DEFAULT: '#2D313B',
          focus: '#3E4351',
          strong: '#4B5263',
        },
        accent: {
          DEFAULT: '#2563EB',
          hover: '#1D4ED8',
          text: '#60A5FA',
          subtle: 'rgba(37, 99, 235, 0.12)',
          border: 'rgba(59, 130, 246, 0.40)',
        },
        terminal: {
          text: '#E6E9F0',
          muted: '#8B93A7',
          dim: '#5A6072',
          bright: '#F8FAFC',
        },
        risk: {
          low: '#34D399',
          'low-bg': 'rgba(16, 185, 129, 0.10)',
          'low-border': 'rgba(16, 185, 129, 0.35)',
          med: '#FBBF24',
          'med-bg': 'rgba(245, 158, 11, 0.10)',
          'med-border': 'rgba(245, 158, 11, 0.35)',
          high: '#F87171',
          'high-bg': 'rgba(239, 68, 68, 0.10)',
          'high-border': 'rgba(239, 68, 68, 0.35)',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'Menlo', 'monospace'],
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.40)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.45), 0 2px 4px -2px rgba(0, 0, 0, 0.40)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.55), 0 4px 6px -4px rgba(0, 0, 0, 0.45)',
      },
      borderRadius: {
        xs: '3px',
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
      },
    },
  },
  plugins: [],
}
