import { drizzle } from 'drizzle-orm/postgres-js'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { schema } from './schema'

export type Database = PostgresJsDatabase<typeof schema>
export type PgClient = ReturnType<typeof postgres>

// Cache singleton partagé entre les rechargements HMR (dev) — jamais de double pool.
const globalRef = globalThis as typeof globalThis & {
  __ossoPgClient?: PgClient
  __ossoDb?: Database
}

function createPgClient(): PgClient {
  const url = process.env.NUXT_DATABASE_URL
  if (!url) {
    throw new Error('[osso/db] NUXT_DATABASE_URL manquante — copie .env.example vers .env')
  }
  // postgres() n'ouvre AUCUNE connexion tant qu'une requête n'est pas émise (lazy).
  return postgres(url, { max: 10, prepare: false })
}

function getClient(): PgClient {
  if (!globalRef.__ossoPgClient) {
    globalRef.__ossoPgClient = createPgClient()
  }
  return globalRef.__ossoPgClient
}

/**
 * Client postgres-js exposé via un Proxy : aucune connexion n'est créée au chargement
 * du module (donc jamais côté client), la connexion réelle est instanciée lazy
 * au premier accès réel, uniquement depuis le code serveur.
 */
export const client: PgClient = new Proxy({} as PgClient, {
  get(_target, property) {
    const real = getClient()
    const value = Reflect.get(real, property, real)
    return typeof value === 'function' ? value.bind(real) : value
  },
})

/** Singleton Drizzle. À importer uniquement depuis du code serveur (server/, utils server). */
export const db: Database = globalRef.__ossoDb ?? (globalRef.__ossoDb = drizzle(client, { schema }))
