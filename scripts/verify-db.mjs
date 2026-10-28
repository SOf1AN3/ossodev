// Verification du schema Supabase apres migration — node --env-file=.env scripts/verify-db.mjs
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

const tables = await sql`
  select table_name from information_schema.tables
  where table_schema = 'public' order by table_name
`
console.log(`TABLES (${tables.length}) :`)
for (const t of tables) {
  const cols = await sql`
    select column_name, data_type, is_nullable
    from information_schema.columns
    where table_name = ${t.table_name} and table_schema = 'public'
    order by ordinal_position
  `
  console.log(`\n  ${t.table_name} (${cols.length})`)
  for (const c of cols) {
    console.log(`     - ${c.column_name.padEnd(18)} ${c.data_type}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}`)
  }
}

const idx = await sql`
  select indexname from pg_indexes
  where schemaname = 'public' order by indexname
`
console.log(`\nINDEX (${idx.length}) :`)
for (const i of idx) console.log(`   - ${i.indexname}`)

const badges = await sql`select code, name, icon from badges order by code`
console.log(`\nBADGES SEED (${badges.length}) :`)
for (const b of badges) console.log(`   ${b.icon}  ${b.code.padEnd(12)} ${b.name}`)

const [ub] = await sql`select count(*)::int as n from user_badges`
console.log(`\nuser_badges : ${ub.n}`)

const cons = await sql`
  select c.conname, c.contype, n.nspname
  from pg_constraint c
  join pg_namespace n on n.oid = c.connamespace
  where n.nspname = 'public'
  order by c.contype, c.conname
`
const byType = { c: 'CHECK', u: 'UNIQUE', p: 'PRIMARY KEY', f: 'FOREIGN KEY' }
console.log(`\nCONTRAINTES (${cons.length}) :`)
for (const c of cons) console.log(`   [${byType[String(c.contype)] ?? String(c.contype)}] ${c.conname}`)

await sql.end({ timeout: 1 })
console.log('\nVERIFICATION TERMINEE')
