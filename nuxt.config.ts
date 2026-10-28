import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-10-28',

  devtools: { enabled: true },

  typescript: { strict: true },

  // Le dashboard est personnel : on écoute sur localhost uniquement.
  // Passer host: '0.0.0.0' explicitement si accès réseau local souhaité.
  devServer: { host: 'localhost' },

  vite: {
    plugins: [tailwindcss()],
  },

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: 'OSSO — Tableau de bord',
      htmlAttrs: { lang: 'fr' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Tableau de bord personnel OSSO' },
      ],
    },
  },

  runtimeConfig: {
    // Lit depuis NUXT_DATABASE_URL
    databaseUrl: '',
    // Racine du dossier dev scanné par brain (NUXT_DEV_ROOT_PATH)
    devRootPath: 'C:/Users/Sofiane/Desktop/dev',
    // Commande pour déclencher brain (NUXT_BRAIN_COMMAND)
    brainCommand: '',
    // Commande d'ouverture de terminal (NUXT_TERMINAL_COMMAND)
    terminalCommand: '',
    // 'true' uniquement en local. 'false' coupe tout ce qui exécute des process.
    localBridge: 'false',
  },
})
