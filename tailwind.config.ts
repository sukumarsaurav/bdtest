import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        flix: {
          green: '#73D700',
          amber: '#FFAD00',
          charcoal: '#444444',
          white: '#FFFFFF',
          gray: '#F5F5F5',
        },
      },
    },
  },
  plugins: [],
};
export default config;
