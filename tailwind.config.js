/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        moul: ['Moul', 'Khmer OS Muol Light', 'Khmer OS Muol', 'serif'],
        battambang: ['Battambang', 'Khmer OS Battambang', 'sans-serif'],
        siemreap: ['Siemreap', 'sans-serif'],
        kantumruy: ['Kantumruy Pro', 'sans-serif'],
      },
      colors: {
        card: {
          blue: '#163d7e',
          darkblue: '#0d2550',
          lightblue: '#1d4ed8',
          border: '#153e7e',
          text: '#112f60',
        },
        apple: {
          bg: '#f5f5f7',
          blue: '#0071e3',
          text: '#1d1d1f',
          muted: '#86868b',
        },
      },
    },
  },
  plugins: [],
};
