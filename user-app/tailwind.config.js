/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./components/**/*.{js,vue,ts}",
    "./layouts/**/*.vue",
    "./pages/**/*.vue",
    "./plugins/**/*.{js,ts}",
    "./app.vue",
    "./error.vue",
  ],
  theme: {
    extend: {},
  },
  plugins: [require('daisyui'),],
  daisyui: {
    themes: [
      {
        mytheme: {
          "primary": "#056839",
          "secondary": "#ffee53",
          "accent": "#288d5c",
          "neutral": "#ff00ff",
          "base-100": "#edf5f2",
          "info": "#056839",
          "success": "#00ff00",
          "warning": "#f97316",
          "error": "#dc2626",
        },
      },
    ],
  },
}

