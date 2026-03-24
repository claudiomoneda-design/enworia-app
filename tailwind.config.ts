import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        enworia: {
          "dark-base": "#1C2B28",
          "dark-surface": "#2A3D39",
          "dark-hover": "#3A5249",
          accent: "#27AE60",
          "accent-dark": "#1A8A47",
          "accent-light": "#E8F9EE",
          "light-bg": "#F4F8F7",
          "light-surface": "#FFFFFF",
          "light-border": "#E2EAE8",
          "ghg-1": "#27AE60",
          "ghg-2": "#4DC47A",
          "ghg-3": "#7DD4A0",
          "ghg-4": "#A8E0BF",
          "ghg-5": "#C8EDD4",
          "ghg-ns": "#3A5249",
          warning: "#E8A020",
          danger: "#E85A4F",
          info: "#5B8DB8",
          "text-primary-dark": "#FFFFFF",
          "text-secondary-dark": "#A8C5BE",
          "text-muted-dark": "#6FCF97",
        },
      },
    },
  },
  plugins: [],
};
export default config;
