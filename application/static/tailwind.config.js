/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      '../../application/templates/**/*.html',
      '../../application/static/js/**/*.js',
      // добавить ваш путь к другим шаблонам по необходимости
    ],
    theme: {
      extend: {},
      screens: {
        'mobile': '375px',  // Малые мобильные устройства
        'tablet-small': '450px', // Малые планшеты
        'tablet': '768px',  // Стандартные планшеты
        'laptop': '1024px', // Ноутбуки
        'desktop': '1440px', // Стандартные настольные компьютеры
        'large-desktop': '1950px' // Большие настольные компьютеры
      },
    },
    plugins: [],
  };