// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: false },
  ssr: false,
  runtimeConfig: {
    public: {
      apiBase: '',
      meeting: '',
      meetingDomain: ''
    }
  },
  modules: [
    '@nuxtjs/i18n',
    '@nuxt/icon',
    '@samk-dev/nuxt-vcalendar',
    '@vite-pwa/nuxt'
  ],

  app: {
    head: {
      // script: [{ src: 'https://moph-meetingroom.moph.go.th/external_api.js' }]
    }
  },
  css: ['~/assets/css/main.css'],

  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },

  i18n: {
    vueI18n: './i18n.config.ts'
  }

})