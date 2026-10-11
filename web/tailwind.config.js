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
        app: '#080B10',
        canvas: '#080B10',
        sidebar: '#0C1118',
        glass: {
          DEFAULT: 'rgba(255, 255, 255, 0.035)',
          elevated: 'rgba(255, 255, 255, 0.055)',
          hover: 'rgba(255, 255, 255, 0.075)',
          subtle: 'rgba(255, 255, 255, 0.02)',
        },
        surface: {
          DEFAULT: 'rgba(255, 255, 255, 0.035)',
          elevated: 'rgba(255, 255, 255, 0.055)',
          hover: 'rgba(255, 255, 255, 0.075)',
          subtle: 'rgba(255, 255, 255, 0.02)',
        },
        border: {
          subtle: 'rgba(226, 235, 244, 0.10)',
          DEFAULT: 'rgba(226, 235, 244, 0.18)',
          glass: 'rgba(226, 235, 244, 0.18)',
          strong: 'rgba(226, 235, 244, 0.30)',
          focus: 'rgba(116, 199, 190, 0.45)',
        },
        main: '#F0F2F5',
        secondary: '#9BA7B5',
        muted: '#687787',
        teal: {
          DEFAULT: '#74C7BE',
          subtle: 'rgba(116, 199, 190, 0.12)',
          border: 'rgba(116, 199, 190, 0.35)',
          hover: '#61B5AC',
        },
        accent: {
          DEFAULT: '#74C7BE',
          subtle: 'rgba(116, 199, 190, 0.12)',
          border: 'rgba(116, 199, 190, 0.35)',
          text: '#74C7BE',
          light: '#8ED6CE',
          hover: '#61B5AC',
        },
        negative: {
          DEFAULT: '#E47782',
          subtle: 'rgba(228, 119, 130, 0.12)',
          border: 'rgba(228, 119, 130, 0.30)',
        },
        positive: {
          DEFAULT: '#86C8A0',
          subtle: 'rgba(134, 200, 160, 0.12)',
          border: 'rgba(134, 200, 160, 0.30)',
        },
        warning: {
          DEFAULT: '#D9B675',
          subtle: 'rgba(217, 182, 117, 0.12)',
          border: 'rgba(217, 182, 117, 0.30)',
        },
        risk: {
          low: '#86C8A0',
          'low-bg': 'rgba(134, 200, 160, 0.10)',
          'low-border': 'rgba(134, 200, 160, 0.30)',
          med: '#D9B675',
          'med-bg': 'rgba(217, 182, 117, 0.10)',
          'med-border': 'rgba(217, 182, 117, 0.30)',
          high: '#E47782',
          'high-bg': 'rgba(228, 119, 130, 0.10)',
          'high-border': 'rgba(228, 119, 130, 0.30)',
        },
        terminal: {
          text: '#F0F2F5',
          muted: '#9BA7B5',
          dim: '#687787',
          bright: '#FFFFFF',
        },
      },
      fontFamily: {
        sans: ['Manrope', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'Menlo', 'monospace'],
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.45)',
        'glass-sm': '0 4px 16px 0 rgba(0, 0, 0, 0.35)',
        'glass-highlight': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
        'glass-highlight-strong': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.16)',
        sm: '0 1px 3px 0 rgba(0, 0, 0, 0.35)',
        md: '0 4px 12px -2px rgba(0, 0, 0, 0.40)',
        lg: '0 8px 24px -4px rgba(0, 0, 0, 0.50)',
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '10px',
        xl: '12px',
        '2xl': '14px',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}

