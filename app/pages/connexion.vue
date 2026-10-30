<script setup lang="ts">
import { FetchError } from 'ofetch'

useHead({ title: 'Connexion — OSSO' })

definePageMeta({ layout: false })

const password = ref('')
const submitting = ref(false)
const errorMessage = ref('')
const passwordInput = useTemplateRef<HTMLInputElement>('passwordInput')

/** Déballage défensif de l'enveloppe serveur { error: { code, message } }. */
function readApiError(err: unknown): { code: string; message: string } | null {
  if (!(err instanceof FetchError)) return null
  const data: unknown = err.data
  if (typeof data !== 'object' || data === null || !('error' in data)) return null
  const failure: unknown = data.error
  if (typeof failure !== 'object' || failure === null || !('message' in failure)) return null
  const message: unknown = failure.message
  if (typeof message !== 'string' || message.length === 0) return null
  const code: unknown = 'code' in failure ? failure.code : undefined
  return { code: typeof code === 'string' ? code : 'INTERNAL', message }
}

async function onSubmit(): Promise<void> {
  if (submitting.value || password.value.length === 0) return
  submitting.value = true
  errorMessage.value = ''

  try {
    // Le mot de passe part uniquement ici : jamais stocké, jamais en URL.
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { password: password.value },
    })
    await navigateTo('/')
  } catch (err: unknown) {
    // Message serveur prioritaire, sinon libellé FR selon le type d'échec.
    const status: number | null =
      err instanceof FetchError && typeof err.statusCode === 'number' ? err.statusCode : null
    errorMessage.value =
      readApiError(err)?.message ??
      (status === 401
        ? 'Mot de passe incorrect.'
        : status === 429
          ? 'Trop de tentatives. Attends quelques instants avant de réessayer.'
          : 'Connexion au serveur impossible. Réessaie dans un instant.')
    password.value = ''
    nextTick(() => passwordInput.value?.focus())
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center p-6">
    <div class="surface w-full max-w-sm p-8">
      <form
        class="flex flex-col"
        :aria-busy="submitting"
        novalidate
        @submit.prevent="onSubmit"
      >
        <header class="flex flex-col items-center text-center">
          <span aria-hidden="true" class="mb-4 h-2 w-2 rounded-full bg-accent-fill" />
          <p class="micro text-ink-700">OSSO</p>
          <h1 class="mt-2 text-2xl font-semibold text-ink-100">Connexion</h1>
          <p class="mt-2 text-sm text-ink-300">
            Entre le mot de passe du dashboard pour continuer.
          </p>
        </header>

        <div class="mt-8 flex flex-col gap-2">
          <label for="connexion-mot-de-passe" class="micro text-ink-500">
            Mot de passe
          </label>
          <div class="field">
            <input
              id="connexion-mot-de-passe"
              ref="passwordInput"
              v-model="password"
              type="password"
              name="password"
              autocomplete="current-password"
              required
              :disabled="submitting"
              :aria-invalid="errorMessage ? true : undefined"
              aria-describedby="connexion-retour"
              class="w-full rounded-sm border border-line bg-surface-800 px-3 py-2.5 text-sm text-ink-100 disabled:opacity-60"
            />
          </div>
        </div>

        <!-- Zone unique d'annonce : toujours montée pour que aria-live soit fiable -->
        <div id="connexion-retour" aria-live="polite" class="mt-3 min-h-6">
          <p v-if="errorMessage" class="text-sm text-danger-400">{{ errorMessage }}</p>
        </div>

        <button
          type="submit"
          class="btn btn-primary mt-5 w-full rounded-sm px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="submitting || password.length === 0"
        >
          {{ submitting ? 'Connexion…' : 'Se connecter' }}
        </button>
      </form>
    </div>
  </main>
</template>
