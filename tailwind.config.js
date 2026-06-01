/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        sidebar: '#0f1117',
        'sidebar-hover': '#1c1f2e',
        'sidebar-active': '#1e2235',
        surface: '#13151f',
        card: '#1a1d2e',
        'card-hover': '#1f2335',
        border: '#2a2d3e',
        accent: '#4f6ef7',
        'accent-hover': '#3a55e8',
      }
    },
  },
  plugins: [],
}
