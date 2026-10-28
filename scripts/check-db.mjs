// Test de connectivite Supabase — usage : node scripts/check-db.mjs
import postgres from 'postgres'

const url = process.env.NUXT_DATABASE_URL || process.env.DATABASE_URL
if (!url) {
  console.error('X  Aucune URL de base dans NUXT_DATABASE_URL / DATABASE_URL')
  process.exit(1)
}

// Masque le mot de passe dans les logs
const masked = url.replace(/:[^:@/]*@/, ':***@')
console.log('-> Connexion a :', masked)

const sql = postgres(url, {
  connect_timeout: 20,
  idle_timeout: 5,
  max: 1,
  ssl: 'require',
})

try {
  const [ping] = await sql`select 1 as ok`
  console.log('OK  Ping reussi :', ping.ok)

  const [ver] = await sql`select version() as v`
  console.log('OK  Version :', String(ver.v).slice(0, 60))

  const [sg] = await sql`
    select current_database() as db, current_user as usr, inet_server_addr() as addr
  `
  console.log('OK  Base:', sg.db, '| user:', sg.usr, '| serveur:', sg.addr)

  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `
  console.log(`-> Tables existantes (${tables.length}) :`,
    tables.map((t) => t.table_name).join(', ') || '(aucune)')

  console.log('\nSUCCES — la base Supabase est joignable.')
} catch (e) {
  console.error('\nECHEC —', e?.message ?? e)
  if (String(e?.message ?? '').includes('ENOTFOUND')) {
    console.error('  => le hostname ne resout pas (DNS).')
  }
  if (String(e?.message ?? '').includes('ECONNREFUSED') || String(e?.message ?? '').includes('ETIMEDOUT')) {
    console.error('  => probablement le IPv6 de la connexion directe.')
    console.error('     Solution : recuperer l URL "Transaction pooler" (port 6543)')
    console.error('     dans Supabase > Settings > Database > Connection string.')
  }
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 1 })
}
