import type { Config } from "tailwindcss";

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: token("canvas"),
        surface: token("surface"),
        raised: token("raised"),
        line: token("line"),
        ink: { DEFAULT: token("ink"), soft: token("ink-soft"), faint: token("ink-faint") },
        brand: { DEFAULT: token("brand"), soft: token("brand-soft"), ink: token("brand-ink") },
        yolk: { DEFAULT: token("yolk"), soft: token("yolk-soft"), ink: token("yolk-ink") },
        good: { DEFAULT: token("good"), soft: token("good-soft") },
        warn: { DEFAULT: token("warn"), soft: token("warn-soft") },
        bad: { DEFAULT: token("bad"), soft: token("bad-soft") },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / .04), 0 10px 28px -18px rgb(0 0 0 / .25)",
        dock: "0 14px 36px -10px rgb(0 0 0 / .45)",
      },
      borderRadius: { "4xl": "1.75rem" },
    },
  },
  plugins: [],
} satisfies Config;
