import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'drizzle-kit'

/**
 * drizzle-kit ne charge PAS `.env` automatiquement.
 * On parse donc le fichier `.env` manuellement (parse basique KEY=VALUE)
 * uniquement si `DATABASE_URL` n'est pas déjà présent dans l'environnement.
 */
function loadDotEnvFile(): void {
  if (process.env.DATABASE_URL) return

  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) return

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue

    const key = trimmed.slice(0, separatorIndex).trim()
    let value = trimmed.slice(separatorIndex + 1).trim()

    // Retire un éventuel encadrement par quotes simples ou doubles
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2)
      || (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    }

    if (key && !(key in process.env)) {
      process.env[key] = value
    }
  }
}

loadDotEnvFile()

// Fallback = URL du service `postgres` de docker-compose.yml (dev local uniquement,
// ce ne sont pas des secrets de production). Permet `drizzle-kit generate` sans .env.
const url = process.env.DATABASE_URL ?? 'postgres://osso:osso@localhost:5432/osso'

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url,
  },
  strict: true,
  verbose: true,
})
