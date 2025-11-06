/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        twitter: {
          blue: '#1DA1F2',
          dark: '#14171A',
          lightGray: '#657786',
          extraLightGray: '#AAB8C2',
          lightest: '#E1E8ED',
          white: '#F5F8FA'
        }
      }
    }
  },
  plugins: []
}
