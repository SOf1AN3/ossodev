import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import prettier from 'eslint-config-prettier'

/**
 * Config ESLint « flat » du dashboard OSSO.
 *
 * - Vue + TS pour `app/` (Nuxt 4), TS strict pour `server/` et `shared/`.
 * - `companion/` et `scripts/` sont des mondes à part (Node pur, hors scope
 *   Nuxt) : on les ignore plutôt que de les faire échouer sur des règles
 *   pensées pour le client.
 * - La dernière config est `pretier` : elle **désactive** toutes les règles de
 *   style qui entreraient en conflit avec le formatter. Elle doit rester en
 *   dernier.
 */
export default tseslint.config(
  {
    ignores: [
      '.nuxt/**',
      '.output/**',
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'companion/**',
      'scripts/**',
      'preview.html',
      'DESIGN.md',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  // Les SFC en `<script setup lang="ts">` doivent être parsés par
  // typescript-eslint via vue-eslint-parser : sans ça, ESLint s'arrête sur le
  // premier `interface` avec « keyword is reserved ».
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Vue impose un ordre d'attributs ; on le relâche pour ne pas freiner.
      'vue/attributes-order': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/first-attribute-linebreak': 'off',
      // Nuxt auto-importe (ref, computed, useRoute…) : les imports manquants
      // sont un faux positif garanti.
      'no-undef': 'off',
      // TS gère déjà ces contrôles, mieux que la règle de base.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Les types `any` ponctuels sont parfois inévitables autour des
      // réponses API ; on les signale sans bloquer.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Nuxt/TS gère l'extension des fichiers ; on n'exige pas d'extension.
      'vue/multi-word-component-names': 'off',
    },
  },

  // Scripts Node (QA, outillage) : pas de règles Vue, globals Node.
  {
    files: ['**/*.mjs', '**/*.cjs'],
    languageOptions: { globals: globals.node },
  },

  prettier,
)
