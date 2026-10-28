// Réinitialise l'état de gamification et liste le contenu de la base.
// Usage : node --env-file=.env scripts/reset-dev-data.mjs --yes
// Sans --yes : affiche uniquement l'état, ne modifie rien.
import postgres from 'postgres'

const CONFIRM = process.argv.includes('--yes')
const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })

const TABLES = [
  'user_badges', 'badges', 'weekly_missions',
  'lead_sessions', 'project_tasks', 'projects',
  'tasks', 'routines', 'ideas', 'settings',
]

const counts = async () => {
  const out = {}
  for (const t of TABLES) {
    out[t] = Number((await sql`select count(*)::int as n from ${sql(t)}`)[0].n)
  }
  return out
}

console.log('=== AVANT ===')
const before = await counts()
for (const [t, n] of Object.entries(before)) {
  console.log(`  ${t.padEnd(16)} ${n}`)
}

if (!CONFIRM) {
  console.log('\n(aucune modification — relance avec --yes pour réinitialiser la gamification)')
  await sql.end({ timeout: 1 })
  process.exit(0)
}

// On ne touche PAS à `badges` (catalogue seedé) ni à `settings` (intro LEAD écrite par l'utilisateur).
const cleared = await sql`delete from user_badges`
const missions = await sql`delete from weekly_missions`
console.log(`\n${cleared.count} badge(s) débloqué(s) remis à zéro`)
console.log(`${missions.count} mission(s) hebdomadaire(s) supprimée(s)`)

console.log('\n=== APRÈS ===')
const after = await counts()
for (const [t, n] of Object.entries(after)) {
  console.log(`  ${t.padEnd(16)} ${n}`)
}

const leftovers = ['tasks', 'routines', 'ideas', 'projects', 'project_tasks', 'lead_sessions']
  .filter((t) => after[t] > 0)
console.log(
  leftovers.length === 0
    ? '\nBase vierge — prête à l\'emploi.'
    : `\nDonnées restantes (volontaires ?) : ${leftovers.join(', ')}`,
)

await sql.end({ timeout: 1 })
