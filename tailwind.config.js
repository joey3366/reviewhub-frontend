/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#ffffff',
          subtle: '#fafafa',
          muted: '#f5f5f5',
        },
        outline: {
          DEFAULT: '#e5e5e5',
          strong: '#d4d4d4',
        },
        ink: {
          DEFAULT: '#0a0a0a',
          muted: '#525252',
          subtle: '#a3a3a3',
        },
        accent: {
          DEFAULT: '#2563eb',
          hover: '#1d4ed8',
          soft: '#eff6ff',
        },
        success: '#16a34a',
        error: '#dc2626',
        warning: '#ca8a04',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
