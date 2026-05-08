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
        brand: {
          bg: "var(--brand-bg)",
          surface: "var(--brand-surface)",
          primary: "var(--brand-primary)",
          accent: "var(--brand-accent)",
          text: "var(--brand-text)",
          sub: "var(--brand-sub)",
          border: "var(--brand-border)",
          line: "var(--brand-line)",
        },
      },
      fontFamily: {
        sans: ["Onest", "-apple-system", "system-ui", "sans-serif"],
        display: ["Unbounded", "sans-serif"],
      },
    },
  },
  plugins: [],
};
