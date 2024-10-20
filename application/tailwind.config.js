/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './templates/**/*.html',
    './static/**/*.js',
  ],
  theme: {
    extend: {},
    screens: {
      'mobile': '375px',  // Малые мобильные устройства
      'tablet-small': '425px', // Малые планшеты
      'tablet': '768px',  // Стандартные планшеты
      'laptop': '1024px', // Ноутбуки
      'desktop': '1440px', // Стандартные настольные компьютеры
      'large-desktop': '1920px' // Большие настольные компьютеры
    },
  },
  plugins: [],
}

