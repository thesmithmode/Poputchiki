/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        tg: {
          bg: "var(--tg-bg)",
          text: "var(--tg-text)",
          hint: "var(--tg-hint)",
          link: "var(--tg-link)",
          accent: "var(--tg-accent)",
          "button-text": "var(--tg-button-text)",
          "secondary-bg": "var(--tg-secondary-bg)",
        },
      },
    },
  },
  plugins: [],
};
