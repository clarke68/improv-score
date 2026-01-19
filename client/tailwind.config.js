/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Noto Sans', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'sans-serif']
      },
      colors: {
        // Custom brand colors that match your styleguide
        'brand-gray': {
          darkest: '#121418',
          DEFAULT: '#474747', // This is what you get with just 'text-brand-gray'
          light: '#e7ebf3' // Light gray for text on dark backgrounds (player screen during rests)
        },
        'brand-feature': {
          DEFAULT: '#e5592e', // Feature/accent color
          light: '#f9ebe5', // Light background variant (like indigo-50/100)
          dark: '#cc4420' // Darker variant for hover states (like indigo-700)
        }
      }
    }
  },
  plugins: [require('@tailwindcss/typography')]
};

