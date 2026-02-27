/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        github: {
          bg: "#0d1117",
          border: "#30363d",
          text: "#c9d1d9",
          "text-secondary": "#8b949e",
          green: "#238636",
          red: "#da3633",
          yellow: "#9e8c3c",
          blue: "#58a6ff",
        },
      },
    },
  },
  plugins: [],
};
