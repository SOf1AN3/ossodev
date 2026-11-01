# PLAN-p2-p3-companion-taches.md

> **Statut** : ⏳ EN ATTENTE DE VALIDATION — aucun code n'a été écrit.
> **Date de cadrage** : 31/10/2026
> **Périmètre** : 4 lots — P2 (palette ⌘K + suppression de cours) · P3 (relecture + cours→projets) · Companion fonctionnel + icône · Hiérarchie de tâches projet
> **Plan parent** : `PLAN.md` (V2) — non modifié, ses contrats restent valables.

---

## Contexte & besoin métier

Quatre demandes distinctes, regroupées parce qu'elles se recoupent sur **deux
fichiers** (`db/schema.ts` pour le lot tâches + P3, et `companion/src/` pour le
lot Companion).

1. **Tâches hiérarchiques** — dans la checklist d'un projet, pouvoir enchaîner
   tâche → sous-tâche → sous-sous-tâche → … sans limite de profondeur.
2. **Palette ⌘K** — un sélecteur rapide qui cherche à la fois dans les 9
   sections, les projets, les tâches et les cours, puis navigue.
3. **P3** — dater la dernière révision d'un cours, et **depuis chaque cours,
   lister les projets qui l'utilisent** (direction retenue : cours → projets).
4. **Companion** — le processus doit **démarrer et afficher son icône** dans la
   barre des tâches. Diagnostic déjà fait : il **crash au démarrage**.

### Constat diagnostic Companion (déjà mesuré, pas une hypothèse)

```
%APPDATA%\osso-companion\config.json
  charCode 0 = 65279  → BOM UTF-8
  JSON.parse(raw)     → SyntaxError: Unexpected token '﻿'
log.txt 30/10 08:03   → ERROR Configuration illisible (JSON invalide)
log.txt 29/10 13:09   → INFO Companion démarré   (ça marchait avant)
```

`companion/src/config.ts:97` lit en `utf8`, `:104` fait un `JSON.parse` **sans
nettoyer le BOM** → `main()` reçoit l'exception → `process.exit(1)` **avant**
`startTray()` (ligne 228 de `index.ts`) → **aucune icône possible**.

Le BOM n'est **pas** émis par `companion-init.mjs:98`
(`writeFileSync(..., 'utf8')` n'ajoute jamais de BOM) : il vient d'un éditeur
externe (Notepad/PowerShell) ayant réécrit le fichier. **L'application doit le
tolérer** — un BOM est légal dans un fichier UTF-8.

---

## Questions / décisions en attente (AUCUNE)

Toutes les décisions sont prises et confirmées par l'utilisateur :

| # | Question | Décision |
|---|---|---|
| 1 | Quel tableau devient hiérarchique ? | **`project_tasks` uniquement** — `tasks` perso (aujourd'hui/planifier) reste plate, aucune migration |
| 2 | Statut du parent ? | **Auto** : parent `done` ⟺ toutes les filles `done` ; décocher une fille décoche le parent |
| 3 | Contenu de la palette ? | **Navigation + recherche globale** (sections, projets, tâches, cours) |
| 4 | Sens du lien cours↔projet ? | **Cours → projets** : sur chaque cours, lister les projets qui l'utilisent |
| 5 | Création du lien ? | **Auto par détection `package.json`** au scan brain — zéro saisie manuelle |
| 6 | Companion au démarrage ? | **Oui, auto au login Windows** |

---

## 1. Base de données (DB) → sous-agent **Database**

### 1.1 `db/schema.ts` — 3 modifications (fichier unique, une seule piste)

**(a) `project_tasks` : colonne auto-référentielle**

```ts
parent_id: uuid('parent_id').references(
  (): AnyPgColumn => projectTasks.id,
  { onDelete: 'cascade' },
),
```

- Importer `AnyPgColumn` depuis `drizzle-orm` (auto-référence en drizzle).
- `onDelete: 'cascade'` → supprimer un parent supprime toute sa branche **au
  niveau DB**, aucun orphelin possible.
- Index de tri remplace l'actuel :
  ```ts
  index('idx_project_tasks_tree').on(t.project_id, t.parent_id, t.position)
  ```
  Le tri se fait **parmi les frères** (même `parent_id`).

**(b) Nouvelle table `project_technologies` (lien cours↔projet)**

```ts
export const projectTechnologies = pgTable(
  'project_technologies',
  {
    project_id: uuid('project_id').notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    technology: text('technology').notNull()
      .references(() => learningCourses.technology, { onDelete: 'cascade' }),
    detected_at: timestamp('detected_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('uniq_project_technology').on(t.project_id, t.technology)],
)
```

- Clé en double interdite : un scan ré-exécuté **upsert** au lieu de dupliquer.
- `technology` référence `learning_courses.technology` (déjà `uniqueIndex`) :
  supprimer un cours efface ses liens ; supprimer un projet efface les siens.

**(c) `learning_courses` : colonne de relecture**

```ts
last_reviewed_at: timestamp('last_reviewed_at', { withTimezone: true }),
```

Nullable — `null` = jamais relu.

### 1.2 Migration

- `npm run db:generate` puis `npm run db:migrate`.
- **Aucune perte de données** : les 3 changements sont additifs (colonne
  nullable, table neuve). Les 10 projets scannés et la tâche « Aller a alger »
  sont intacts — vérification obligatoire après migration (§ Tests).

### 1.3 `shared/types.ts` — types exportés (contrat pour les 3 autres pistes)

```ts
export interface ProjectTaskNode {
  id: string
  project_id: string
  title: string
  position: number
  is_done: boolean
  parent_id: string | null
  children: ProjectTaskNode[]   // ← arbre construit côté serveur
}

export interface CourseWithProjects {
  technology: string
  title: string
  status: 'todo' | 'done'
  last_reviewed_at: string | null
  projects: Array<{ id: string; name: string; folder_path: string }>
}
```

---

## 2. API Routes → sous-agent **Backend**

### 2.1 Hiérarchie `project_tasks`

| Fichier | Action |
|---|---|
| `server/repositories/projectTasks.ts` | **modifier** — arbre, position parmi frères, remontée de statut |
| `server/validation/projects.ts` | **modifier** — accepter `parent_id` dans la création de tâche projet |
| `server/api/projects/[id]/tasks/index.post.ts` | **modifier** — créer avec `parent_id` optionnel |
| `server/api/projects/[id]/tasks/[taskId]/index.patch.ts` | **modifier** — bascule `is_done` + cascade ancestors |
| `server/api/projects/[id]/tasks/[taskId]/index.delete.ts` | **modifier** — cascade DB déjà gérée, purger le cache d'arbre |

**Règle de statut (figée)** :

```
apès toute écriture sur une tâche T :
  si T a des filles :
     T.is_done = TOUTES les filles sont done
  si T est devenue done ou undone :
     remonter le même calcul sur le parent de T, jusqu'à la racine
```

- Une tâche **sans fille** garde sa coche manuelle (comportement actuel
  inchangé — aucun régression sur les projets existants).
- `parent_id` doit appartenir **au même projet** (`project_id` identique) :
  sinon `400 VALIDATION`. C'est un contrôle d'accès, pas un détail.

**Anti-cycle** (obligatoire, la profondeur est illimitée) :

```
à la création / au changement de parent_id :
  remonter depuis le parent candidat jusqu'à la racine ;
  si on rencontre T elle-même → 400 (cycle)
```

**Position** : `position = max(position des frères) + 1` (même `parent_id`).
Jamais de réindexation globale.

### 2.2 P3 — cours

| Fichier | Action |
|---|---|
| `server/api/learning/[technology]/index.delete.ts` | **créer** — supprime le cours (la DB cascade les liens) |
| `server/api/learning/[technology]/review.post.ts` | **créer** — pose `last_reviewed_at = now()` |
| `server/repositories/learning.ts` | **modifier** — renvoyer `last_reviewed_at` + les projets liés |
| `server/api/learning/index.get.ts` | **modifier** — inclure le nouveau champ |

### 2.3 Scan → détection de technologies

| Fichier | Action |
|---|---|
| `server/api/companion/brain-result.post.ts` | **modifier** — lire `technologies: string[]` par projet, upsert dans `project_technologies` |

**Contrat de payload (figé)** — le Companion envoie, le serveur consomme :

```jsonc
// payload.projects[i] — EXISTANT, on AJOUTE un champ
{
  "name": "...",
  "folder_path": "...",
  "technologies": ["vuejs", "tailwindcss"]   // ← NOUVEAU, peut être []
}
```

- Le serveur **remplace** les liens du projet (upsert + purge des absents) : un
  scan corrigé reflète la réalité, pas un cumul.
- Une technologie inconnue de `learning_courses` est **ignorée silencieusement**
  (pas d'erreur, pas d'insertion orpheline).

---

## 3. UI Components → sous-agent **Frontend**

### 3.1 Hiérarchie visuelle

| Fichier | Action |
|---|---|
| `app/components/projects/Checklist.vue` | **modifier** — rendre l'arbre, bouton « + Sous-tâche » |
| `app/components/projects/ChecklistItem.vue` | **modifier** — récursion (auto-import du composant par son propre nom), indentation `pl-5` + filet vertical `border-l` |
| `app/pages/projets/[id].vue` | **modifier** — passer l'arbre (désormais `children[]`) |

- **Composant récursif** : `ChecklistItem` s'importe lui-même dans son propre
  `<script setup>` — Vue gère la récursion, aucun `max-depth` codé en dur.
- **Accessibilité** : `role="tree"` / `role="treeitem"` + `aria-level`
  (profondeur réelle) + `aria-expanded` sur les nœuds ayant des filles.
  Sans ça, un lecteur d'écran entend une liste plate de 40 items.
- Les libellés d'action changent selon la profondeur : « + Sous-tâche »
  devient « + Sous-sous-tâche » à partir de `aria-level >= 2` (plus parlant
  que « Sous-tâche » partout).

### 3.2 Palette ⌘K

| Fichier | Action |
|---|---|
| `app/composables/useCommandPalette.ts` | **créer** — store module-scope (même technique que `useMobileNav.ts`) |
| `app/components/ui/CommandPalette.vue` | **créer** — voile + champ + résultats groupés |
| `app/components/layout/Topbar.vue` | **modifier** — bouton « Rechercher ⌘K » `hidden lg:flex` |
| `app/layouts/default.vue` | **modifier** — monter la palette globalement |

- **Raccourci** : `⌘K` (mac) **et** `Ctrl+K` (Windows/Linux), `Échap` ferme,
  `↑/↓` circulent, `Entrée` valide. Le champ garde le focus pendant la frappe.
- **Sources** (aucune nouvelle route nécessaire — on réutilise l'existant) :
  | Source | Route |
  |---|---|
  | 9 sections | `NAV_GROUPS` (`app/utils/navigation.ts`, statique) |
  | Projets | `GET /api/projects` |
  | Tâches | `GET /api/tasks` |
  | Cours | `GET /api/learning` |
- Les listes sont récupérées **à la première ouverture** puis mises en cache
  dans le composable (pas de polling, pas de requête à chaque frappe).
- **Filtrage côté client** sur `title`/`name`, insensible à la casse, tri par
  pertinence (match en début de chaîne d'abord).
- **Mobile** : la palette est **masquée sous `lg`** — le hamburger du drawer
  (déjà en place) reste le chemin mobile. Pas de double navigation.
- Aucun secret affiché, aucune donnée hors des 4 sources.

### 3.3 P3 côté UI

| Fichier | Action |
|---|---|
| `app/pages/apprentissage/index.vue` | **modifier** — badge de dernière révision + **bouton de suppression** |
| `app/pages/apprentissage/[technology].vue` | **modifier** — section « Utilisé dans » (projets liés), `POST /review` à l'ouverture |

- **Suppression** : `UiModal` de confirmation (jamais de `confirm()` natif),
  message explicitant que le contenu Markdown est définitivement effacé.
  Après succès → retour à la liste + toast.
- **`last_reviewed_at`** : posé au montage de la page de cours (une requête
  `POST` unique, échec silencieux — la lecture ne doit jamais échouer à cause
  d'un horodatage).

---

## 4. Companion → sous-agent **Companion** (piste séparée)

### 4.1 Fix du BOM (le bug bloquant)

| Fichier | Action |
|---|---|
| `companion/src/config.ts` | **modifier** — strip BOM à la ligne 97-104 |
| `scripts/companion-init.mjs` | **modifier** — vérifier après écriture qu'aucun BOM n'a été introduit |

```ts
// config.ts — après readFileSync(..., 'utf8')
const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
const parsed = JSON.parse(text)
```

- Le message d'erreur existant (« Configuration illisible (JSON invalide) »
  + conseil `companion-init.mjs`) est **conservé tel quel** pour tout autre
  problème de syntaxe.

### 4.2 Détection des technologies au scan

| Fichier | Action |
|---|---|
| `companion/src/commands/brainScan.ts` | **modifier** — lire `package.json` de chaque projet, matcher les dépendances contre les slugs de cours |

- **Lecture seule** : `JSON.parse` de `package.json`, aucun code exécuté.
- Sources : `dependencies` **et** `devDependencies` (+ `peerDependencies`).
- Slugs visés : ceux de `learning_courses.technology` (`vuejs`,
  `tailwindcss`, `drizzle`, …) — **liste blanche côté Companion**, jamais
  déduite d'une réponse réseau.
- Formatage de la correspondance : normalisation `vue` → `vuejs`,
  `@tailwindcss/vite` → `tailwindcss` (table de synonymes locale).
- Échec de lecture (`package.json` absent/corrompu) → `technologies: []`,
  jamais une erreur de scan.

### 4.3 Icône au démarrage Windows

| Fichier | Action |
|---|---|
| `scripts/companion-autostart.mjs` | **créer** — installe une tâche planifiée « au login » |

- **Méthode retenue : tâche planifiée `schtasks`** (onlogon), pas le dossier
  `shell:startup` :
  - `start.ps1` lance déjà `Start-Process … -WindowStyle Hidden` ;
  - une tâche planifiée ne fait **aucun flash de console** au login ;
  - idempotent : on supprime puis on recrée (re-exécution sans doublon).
- Commande cible : `powershell.exe -NoProfile -WindowStyle Hidden -File <start.ps1>`
- Le script affiche l'état final (`schtasks /query`) et se contente si la
  tâche existe déjà.
- **Échec non bloquant** : si `schtasks` est refusé (droits), on affiche la
  commande manuelle à exécuter, on n'échoue pas tout le lot.

---

## 5. Partition des fichiers (obligatoire pour le parallélisme)

| Piste | Fichiers |
|---|---|
| **🗄️ DB** | `db/schema.ts`, `db/migrations/*`, `shared/types.ts` |
| **⚙️ Backend** | `server/repositories/projectTasks.ts`, `server/repositories/learning.ts`, `server/validation/projects.ts`, `server/api/projects/[id]/tasks/index.post.ts`, `server/api/projects/[id]/tasks/[taskId]/index.patch.ts`, `server/api/projects/[id]/tasks/[taskId]/index.delete.ts`, `server/api/learning/index.get.ts`, `server/api/learning/[technology]/index.delete.ts`, `server/api/learning/[technology]/review.post.ts`, `server/api/companion/brain-result.post.ts` |
| **📦 Companion** | `companion/src/config.ts`, `companion/src/commands/brainScan.ts`, `scripts/companion-init.mjs`, `scripts/companion-autostart.mjs` |
| **🎨 Frontend** | `app/components/projects/Checklist.vue`, `app/components/projects/ChecklistItem.vue`, `app/pages/projets/[id].vue`, `app/composables/useCommandPalette.ts`, `app/components/ui/CommandPalette.vue`, `app/components/layout/Topbar.vue`, `app/layouts/default.vue`, `app/pages/apprentissage/index.vue`, `app/pages/apprentissage/[technology].vue` |

**Aucun fichier dans deux pistes simultanément.** Contrat-first : le §1.3 fige
les types partagés → **les 4 pistes partent ensemble**.

---

## 6. Sécurité & edge cases à couvrir

### Sécurité
- **IDOR sur sous-tâches** : `parent_id` doit résider dans le **même
  `project_id`** — sinon un client pourrait rattacher une tâche d'un projet à
  un autre projet. Rejet `400 VALIDATION`.
- **Anti-cycle** : sans lui, une profondeur illimitée permet de créer une
  branche infinie et de faire boucler le calcul de statut (DoS applicatif).
- **Palette** : n'affiche que les 4 sources autorisées ; aucun en-tête
  d'auth, aucun secret, aucune donnée hors BDD affichée.
- **Détection `package.json`** : lecture seule, `JSON.parse` sans `eval`,
  fichier jamais transmis tel quel au client.
- **Suppression de cours** : route protégée par le middleware d'auth déjà en
  place (`/api/learning/*` n'est pas dans la liste blanche d'exemptions → 401
  sans session). Confirmation UI obligatoire.
- **Thème clair** : les classes ajoutées n'utilisent que des tokens existants
  (`surface-*`, `ink-100/300/500/700`, `line`, `accent-*`, `danger-400`).

### Edge cases
| Cas | Traitement |
|---|---|
| Parent avec 0 fille | Coche manuelle normale (aucune régression) |
| Marquer un parent done alors que des filles sont `todo` | Interdit par la règle : recalcul écrase la saisie |
| Supprimer un parent | Cascade DB → toute la branche disparaît |
| Cycle `parent_id` | `400 VALIDATION` (§2.1) |
| Scan ré-exécuté | Upsert — pas de doublon (`uniq_project_technology`) |
| Projet supprimé | Cascade → liens effacés |
| Cours supprimé | Cascade → liens effacés |
| `package.json` absent | `technologies: []`, scan intact |
| Technologie inconnue au scan | Ignorée silencieusement |
| `last_reviewed_at` : échec du POST | Silencieux — la lecture d'un cours ne doit jamais échouer |
| Palette ouverte sans réseau | Sections (statiques) toujours listées ; listes vides affichent un état vide explicite |
| Palette sur mobile | Masquée sous `lg` — le drawer reste le chemin |
| BOM absent de `config.json` | Strip inoffensif (vérifié `charCode !== 0xfeff` → pas de modification) |
| `schtasks` refusé (droits) | Message + commande manuelle, pas d'échec global |

---

## 7. Contrats inter-pistes (schéma DB + types partagés, FIGÉS ICI)

```ts
// ══ DB (piste DB, seule à pouvoir modifier db/schema.ts) ══════════════
project_tasks.parent_id        : uuid NULL, FK self, onDelete cascade
project_technologies           : (project_id, technology, detected_at)
                                  PK/unique = (project_id, technology)
learning_courses.last_reviewed_at : timestamp NULL

// ══ Types partagés (shared/types.ts, piste DB) ════════════════════════
ProjectTaskNode { id, project_id, title, position, is_done, parent_id, children[] }
CourseWithProjects { technology, title, status, last_reviewed_at, projects[] }

// ══ Payload Companion → Serveur (figé) ════════════════════════════════
payload.projects[i].technologies : string[]   // slugs, [] si aucun

// ══ Règle de statut (figée, Backend) ═════════════════════════════════
parent.is_done ⟺ toutes les filles.is_done ; sinon coche manuelle
après toute écriture : recalcul ancestors jusqu'à la racine

// ══ Chemins d'API créés ═══════════════════════════════════════════════
DELETE /api/learning/[technology]
POST   /api/learning/[technology]/review
```

---

## 8. Ordre d'exécution

**Contrat-first → parallélisme total.** Les types du §7 étant figés dans ce
plan, les 4 pistes partent **en même temps**, en arrière-plan :

```
1. 🗄️ DB  ∥  ⚙️ Backend  ∥  📦 Companion  ∥  🎨 Frontend   (simultané)
2. Commit sérialisé, une tâche AUTO-OK à la fois
3. 🧪 Tester (fin de module, en arrière-plan)
4. Vérification finale : npm run check + npm test + npm run build
```

**Contraintes de séquence** :
- La migration DB est **non bloquante** pour les autres pistes (contrat figé),
  mais le **Backend ne peut pas tester** sans elle → le Tester part après DB.
- `npm test` exige le serveur local (le runner vérifie déjà la joignabilité).
- **Jamais deux agents navigateur en parallèle** (erreur commise en V1).
  Les vérifications visuelles se font par le Lead, en séquentiel.

---

## 9. Critères de « fait »

1. **Sous-tâches** : création à 3 niveaux minimum visibles, statut du parent
   synchronisé (coche la dernière fille → parent coche ; décoche → parent
   décoche), cycle refusé, profondeur illimitée testée à 6 niveaux.
2. **Palette** : `⌘K` et `Ctrl+K` ouvrent le panneau, la recherche trouve une
   section, un projet, une tâche et un cours, `Échap` ferme, focus géré.
3. **P3** : un cours supprimé disparaît de la liste **et** de la base ; les
   projets apparaissent sur la fiche du cours après un scan ; `last_reviewed_at`
   se renseigne à l'ouverture.
4. **Companion** : `node companion/src/index.ts` démarre **sans erreur**,
   l'icône verte apparaît dans la barre des tâches, le statut se met à jour,
   et la tâche planifiée existe (re-vérifiable via `schtasks /query`).
5. **Aucune régression** : `npm run check` vert, `npm test` vert, les 10
   projets scannés et la tâche « Aller a alger » toujours présents.

---

## 10. Validation finale (auto-revue des sous-agents → Tester)

1. Chaque piste renvoie **`AUTO-OK`** (sécurité · TypeScript strict ·
   conventions · périmètre respecté).
2. **Tester** (en arrière-plan) : parcours E2E via MCP Playwright —
   création d'une arbre de tâches, ouverture de la palette, suppression d'un
   cours avec confirmation, état du Companion.
3. **Lead** : relecture visuelle **séquentielle** des 3 écrans concernés.
4. Rapport final à l'utilisateur : fichiers touchés, statut des auto-revues,
   résultats des tests, et tout écart au plan.
