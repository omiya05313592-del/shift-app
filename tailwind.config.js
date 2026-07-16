/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ステータス色
        work:  { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
        off:   { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
        paid:  { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
        closed:{ bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },
      },
    },
  },
  plugins: [],
}
