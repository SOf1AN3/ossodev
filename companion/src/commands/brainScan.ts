/**
 * Commande `brain:scan` — LECTURE SEULE.
 *
 * Liste les sous-dossiers directs de `dev_root`, détecte les marqueurs de projet
 * et les technologies du `package.json` de chaque projet, puis renvoie le
 * résultat à `/api/companion/brain-result`.
 * Aucune écriture, aucun déplacement sur le disque, aucun code exécuté.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import type { BrainProject, BrainScanPayload } from '../api.ts'
import { errorMessage, type CompanionConfig } from '../config.ts'

/**
 * Projet du payload `brain:scan`.
 *
 * `BrainProject` (companion/src/api.ts) ne déclare pas encore `technologies`
 * alors que le contrat serveur l'attend : on l'ajoute par intersection typée —
 * assignable à `BrainProject`, le champ est bien sérialisé dans le payload.
 * Quand api.ts déclarera `technologies: string[]`, cette intersection reste
 * valide telle quelle.
 */
type BrainProjectWithTechnologies = BrainProject & { technologies: string[] }

/** Marqueurs de projet détectés dans un sous-dossier direct. */
const PROJECT_MARKERS = [
  '.git',
  'package.json',
  'Cargo.toml',
  'pyproject.toml',
  'go.mod',
  'composer.json',
  '.opencode',
] as const

async function isProjectFolder(folderPath: string): Promise<boolean> {
  for (const marker of PROJECT_MARKERS) {
    try {
      await fs.access(path.join(folderPath, marker))
      return true
    } catch {
      // Marqueur absent → on continue.
    }
  }
  return false
}

// ── Détection des technologies ───────────────────────────────────────────────

/** Slugs de technologies reconnus — alignés sur la table `learning_courses.technology`. */
const KNOWN_TECHNOLOGIES = new Set([
  'drizzle',
  'nuxt',
  'postgres',
  'tailwindcss',
  'typescript',
  'vuejs',
])

/** Table de synonymes locale : nom de dépendance npm → slug de cours. */
const TECHNOLOGY_SYNONYMS: Record<string, string> = {
  vue: 'vuejs',
  nuxt: 'nuxt',
  tailwindcss: 'tailwindcss',
  '@tailwindcss/vite': 'tailwindcss',
  '@tailwindcss/postcss': 'tailwindcss',
  'drizzle-orm': 'drizzle',
  'drizzle-kit': 'drizzle',
  typescript: 'typescript',
  pg: 'postgres',
}

/** Sections d'un `package.json` inspectées pour les dépendances. */
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'] as const

/**
 * Normalise un nom de dépendance vers un slug de la liste blanche,
 * ou `null` si la technologie n'est pas reconnue.
 */
function normalizeTechnology(dependencyName: string): string | null {
  if (KNOWN_TECHNOLOGIES.has(dependencyName)) return dependencyName
  const slug = TECHNOLOGY_SYNONYMS[dependencyName]
  return slug !== undefined && KNOWN_TECHNOLOGIES.has(slug) ? slug : null
}

/**
 * Lit le `package.json` d'un projet (lecture seule, `JSON.parse` uniquement —
 * aucun code du projet scanné n'est exécuté) et retourne les slugs de
 * technologies détectés, sans doublon et triés.
 *
 * Fichier absent, illisible ou corrompu → `[]` : le scan ne doit jamais échouer.
 */
async function detectTechnologies(folderPath: string): Promise<string[]> {
  let raw: string
  try {
    raw = await fs.readFile(path.join(folderPath, 'package.json'), 'utf8')
  } catch {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null) return []

  const record = parsed as Record<string, unknown>
  const detected = new Set<string>()
  for (const field of DEPENDENCY_FIELDS) {
    const deps = record[field]
    if (typeof deps !== 'object' || deps === null) continue
    for (const dependencyName of Object.keys(deps as Record<string, unknown>)) {
      const slug = normalizeTechnology(dependencyName)
      if (slug !== null) detected.add(slug)
    }
  }
  return [...detected].sort((a, b) => a.localeCompare(b, 'fr'))
}

/** Scanne `dev_root` (lecture seule) et renvoie le payload à envoyer. */
export async function buildScanPayload(config: CompanionConfig): Promise<BrainScanPayload> {
  const devRoot = config.dev_root
  const errors: string[] = []
  const projects: BrainProject[] = []

  let entries
  try {
    entries = await fs.readdir(devRoot, { withFileTypes: true })
  } catch (error) {
    throw new Error(`Lecture de dev_root impossible (${devRoot}) : ${errorMessage(error)}`)
  }

  const folders = entries
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  for (const folder of folders) {
    const folderPath = path.join(devRoot, folder.name)
    try {
      if (await isProjectFolder(folderPath)) {
        const technologies = await detectTechnologies(folderPath)
        const project: BrainProjectWithTechnologies = {
          name: folder.name,
          folder_path: folderPath,
          technologies,
        }
        projects.push(project)
      }
    } catch (error) {
      // Un dossier illisible n'arrête pas le scan : on le remonte dans errors.
      errors.push(`${folder.name} : ${errorMessage(error)}`)
    }
  }

  return { dev_root: devRoot, projects, errors }
}
