# PLAN.md — Dashboard personnel « OSSO »

> **Statut** : ⏳ EN ATTENTE DE VALIDATION — aucun code applicatif n'a été écrit.
> **Date de cadrage** : 28/10/2026

---

## Contexte & besoin métier

Une application **personnelle unique** (pas d'auth, pas d'utilisateurs multiples) servant de **tableau de bord central** pour deux mondes **strictement séparés** :

1. **Monde Dev** — la liste des projets situés dans `C:\Users\Sofiane\Desktop\dev`, leur checklist de tâches, la supervision par l'agent `brain`, et le lancement de sessions OpenCode via un bouton **LEAD**.
2. **Monde Perso** — l'organisation quotidienne : tâches du jour, planification future, routines récurrentes, idées de projets, et gamification.

**Stack choisie** : Nuxt 4 (Vue 3, TypeScript strict) + Tailwind CSS + Drizzle ORM + **PostgreSQL local (Docker)**.
> Postgres local = schéma 100 % identique à Supabase. Le basculement futur = changer l'URL dans `.env`. Aucune réécriture.

**Contrainte d'architecture majeure** : le dashboard tourne en **localhost** aujourd'hui, **Vercel** prévu plus tard. Or le bouton LEAD et le rescan `brain` doivent exécuter des processus **sur la machine locale**. → Toute capacité d'exécution locale est isolée dans une couche **« Local Bridge »**, désactivable proprement en ligne.

---

## Questions / décisions en attente

**Aucune.** Toutes les questions ont été tranchées avec l'utilisateur.

### Décisions validées par l'utilisateur

| # | Sujet | Décision |
|---|---|---|
| D1 | Hébergement | `localhost` aujourd'hui, Vercel plus tard |
| D2 | Bouton LEAD | Génération du prompt + **ouverture d'un terminal** dans le dossier du projet |
| D3 | Agent `brain` | **Les deux** : scan manuel possible + bouton de rescan déclenché depuis le dashboard |
| D4 | Tâche non faite | **Report auto au lendemain** ET **affichage en rouge « EN RETARD »** |
| D5 | Gamification | Streak · Barre du jour · Badges · Mission hebdo · Records & comparaison |
| D6 | Dev vs Perso | **Deux mondes séparés** — les tâches dev n'entrent ni dans *Aujourd'hui* ni dans la gamification |
| D7 | Idées de projets | **Simple dump** : titre + description |
| D8 | Tâches d'un projet dev | **Checklist ordonnée** |
| D9 | Routines hebdomadaires | **Jours explicites à cocher** |
| D10 | Base de données | **Postgres local via Docker** |
| D11 | Langue UI | **Français** |
| D12 | Mobile | **Desktop-first, mobile OK** |
| D13 | Dossier dev racine | `C:\Users\Sofiane\Desktop\dev` — `ossodev` y sera déplacé **manuellement** par l'utilisateur |
| D14 | Texte d'intro LEAD | **Éditable dans l'app** (page Réglages), persistant jusqu'à modification |

---

## Décisions d'architecture retenues (sans impact métier, à signaler si rejet)

| Sujet | Choix | Raison |
|---|---|---|
| Streak & jours vides | Un jour **sans aucune tâche planifiée** est **neutre** : il ne casse pas le streak | Évite de punir un dimanche où rien n'était prévu |
| Phasage gamification | **V1** : points + streak + barre du jour. **V2** : badges + mission hebdo + records + page *Progrès* | Livrer les 5 systèmes d'un coup double le temps de dev |
| Génération des instances de routines | **Lazy** (calcul à la lecture, idempotent) et non cron | Zéro processus planifié, robuste aux erreurs, testable |
| Placeholder du prompt LEAD | `{{TACHES}}`, `{{PROJET}}`, `{{DOSSIER}}` — si `{{TACHES}}` est absent, la liste est **appendée en fin** | L'utilisateur peut écrire son intro librement sans casser le mécanisme |
| Détection des projets dans `dev/` | Sous-dossier contenant un marqueur : `.git/`, `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `composer.json`, `.opencode/` + **ajout manuel** possible | Zéro configuration, tolère les cas limites |
| Scan brain | **Lecture seule** — brain ne déplace ni ne supprime rien | D13 : l'utilisateur déplace manuellement |

---

## 1. Base de données (DB) → sous-agent **Database**

### 1.1 Fichiers à créer
| Fichier | Contenu |
|---|---|
| `docker-compose.yml` | Service `postgres:16`, port 5432, volume persistant, credentials dev |
| `.env.example` | `DATABASE_URL`, `NUXT_PUBLIC_LOCAL_BRIDGE`, chemins dev |
| `drizzle.config.ts` | Config Drizzle Kit, dialect `postgresql` |
| `db/schema.ts` | **Schéma complet — contrat figé ci-dessous** |
| `db/index.ts` | Singleton `drizzle()` (driver `postgres-js`) |
| `db/migrations/0000_init.sql` | Migration générée + commitée |

### 1.2 Contrat DB (FIGÉ — ne pas modifier sans re-validation)

```sql
-- Réglages clé/valeur (intro LEAD, commandes brain & terminal)
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Projets dev (alimentés par brain ou à la main)
CREATE TABLE projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  folder_path   TEXT NOT NULL UNIQUE,
  last_scan_at  TIMESTAMPTZ,
  is_archived   BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Checklist ordonnée d'un projet dev
CREATE TABLE project_tasks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  position   INTEGER NOT NULL,
  is_done    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_project_tasks_project ON project_tasks(project_id, position);

-- Gabarits de tâches répétitives
CREATE TABLE routines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  frequency   TEXT NOT NULL CHECK (frequency IN ('daily','weekly')),
  weekdays    INTEGER[],                 -- 0=dimanche … 6=samedi ; NULL si daily
  points      INTEGER NOT NULL DEFAULT 10,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  start_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tâches perso (one-off OU instance de routine)
CREATE TABLE tasks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  priority       INTEGER NOT NULL DEFAULT 2,      -- 1 haute · 2 normale · 3 basse
  source         TEXT NOT NULL DEFAULT 'oneoff' CHECK (source IN ('oneoff','routine')),
  scheduled_date DATE NOT NULL,
  routine_id     UUID REFERENCES routines(id) ON DELETE SET NULL,
  points         INTEGER NOT NULL DEFAULT 10,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Idempotence : une routine ne génère qu'UNE instance par jour
CREATE UNIQUE INDEX uniq_routine_instance ON tasks(routine_id, scheduled_date)
  WHERE routine_id IS NOT NULL;
CREATE INDEX idx_tasks_scheduled ON tasks(scheduled_date);
CREATE INDEX idx_tasks_status    ON tasks(status);

-- Inbox d'idées
CREATE TABLE ideas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mission hebdomadaire (gamification V2)
CREATE TABLE weekly_missions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start   DATE NOT NULL,             -- lundi de la semaine
  title        TEXT NOT NULL,
  target       INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_start)
);

-- Catalogue de badges (seedé en migration)
CREATE TABLE badges (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT NOT NULL
);

-- Badges obtenus
CREATE TABLE user_badges (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_code TEXT NOT NULL REFERENCES badges(code) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (badge_code)
);

-- Journal des sessions LEAD lancées
CREATE TABLE lead_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  prompt_snapshot TEXT NOT NULL,
  launched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Seed** : table `badges` remplie par la migration (12 badges — liste en §4.4).

### 1.3 Critères « fait »
- `docker compose up -d` démarrage OK
- `drizzle-kit generate` + `migrate` OK, aucun avertissement
- Aucune donnée perso en dur dans la migration

---

## 2. API Routes / Server Actions → sous-agent **Backend**

### 2.1 Repositories (`server/repositories/`) — accès DB unique
| Fichier | Responsabilité |
|---|---|
| `tasks.ts` | CRUD, requête « aujourd'hui », requête « planifié de X à Y », **génération lazy des instances de routines** |
| `routines.ts` | CRUD gabarits |
| `projects.ts` | CRUD + upsert lors du scan |
| `projectTasks.ts` | Checklist ordonnée, réordonnancement |
| `ideas.ts` | CRUD dump |
| `settings.ts` | Lecture/écriture clé-valeur + valeurs par défaut |

### 2.2 Services (`server/services/`)
| Fichier | Responsabilité |
|---|---|
| `prompt.ts` | Résolution des placeholders `{{TACHES}}` / `{{PROJET}}` / `{{DOSSIER}}` → prompt final |
| `brain.ts` | Scan du dossier dev : listing des sous-dossiers, détection de marqueurs, upsert `projects` |
| `gamification.ts` | Points, niveau, streak, barre du jour, évaluation des badges, missions, records |

### 2.3 Routes API
| Route | Méthode | Rôle |
|---|---|---|
| `/api/tasks` | GET `?date=` · POST | Lire (inst routines générées à la volée) · créer |
| `/api/tasks/[id]` | PATCH · DELETE | Modifier (statut → pose `completed_at`) · supprimer |
| `/api/tasks/[id]/move` | POST | **Report auto** d'une tâche non faite → lendemain |
| `/api/routines` | GET · POST | Lister · créer |
| `/api/routines/[id]` | PATCH · DELETE | Éditer · supprimer (instances futures purgées) |
| `/api/projects` | GET · POST | Lister · ajout manuel |
| `/api/projects/[id]` | PATCH · DELETE | Éditer (archivage) · supprimer |
| `/api/projects/[id]/tasks` | GET · POST | Checklist · ajout |
| `/api/projects/[id]/tasks/[taskId]` | PATCH · DELETE | Modifier · supprimer |
| `/api/projects/[id]/tasks/reorder` | POST | Réordonnancement par drag |
| `/api/projects/[id]/lead` | POST | Génère le prompt, écrit `prompt.md`, copie presse-papier, ouvre terminal, journalise |
| `/api/ideas` | GET · POST | Dump |
| `/api/ideas/[id]` | PATCH · DELETE | Éditer · supprimer |
| `/api/gamification/summary` | GET | Points, niveau, streak, barre du jour |
| `/api/gamification/records` | GET | Records & comparaison (V2) |
| `/api/gamification/missions/current` | GET · POST | Mission hebdo en cours (V2) |
| `/api/settings` | GET · PUT | Réglages (intro LEAD, commandes brain & terminal) |
| `/api/brain/scan` | POST | Déclenche le rescan (Local Bridge) |
| `/api/bridge/status` | GET | `{ available: boolean, reason?: string }` |

### 2.4 Critères « fait »
- TypeScript strict, aucun `any`
- Toutes les entrées validées par **Zod**
- Réponses typées et partagées avec le front via `shared/types.ts`
- Aucune requête SQL concaténée (Drizzle paramétré uniquement)

---

## 3. UI Components → sous-agent **Frontend**

### 3.1 Pages (8 en V1 + 1 en V2)
| Page | Route | Contenu |
|---|---|---|
| **Tableau de bord** | `/` | Widget *Jour* (barre + streak), **capture rapide d'idée**, cartes projets + dernier scan, bouton réscan, résumé mission |
| **Aujourd'hui** | `/aujourdhui` | Tâches du jour groupées *Perso* / *Routines* · **retards en rouge en haut** · check + édition inline |
| **Planifier** | `/planifier` | Calendrier mensuel + sections **Demain / Cette semaine / Plus tard** · déplacement par sélection de date · création datée |
| **Routines** | `/routines` | CRUD gabarits, jours cochés (0–6), points, actif/inactif, aperçu « apparaîtra le… » |
| **Idées** | `/idees` | Dump titre + description · ajout rapide, édition, suppression |
| **Projets** | `/projets` | Liste des projets dev, dernier scan, nb tâches ouvertes, bouton **Rescan**, ajout manuel |
| **Projet** | `/projets/[id]` | **Checklist ordonnée** (drag) · bouton **LEAD** avec aperçu du prompt avant lancement · statut du scan |
| **Réglages** | `/reglages` | **Éditeur du template d'intro LEAD** + aperçu live · commande brain · commande terminal · (V2) réglages gamification |
| **Progrès** *(V2)* | `/progres` | Badges, records, missions, graphique de productivité |

### 3.2 Composants
```
app/components/
  ui/            Button · Modal · Input · Toast · Badge · Card · EmptyState
  layout/        Sidebar · Topbar
  dashboard/     JourWidget · IdeaCapture · ProjectCard · MissionSummary
  tasks/         TaskItem · TaskEditor · TaskList · RetardBanner · DateCalendar
  routines/      RoutineForm · WeekdayPicker · RoutinePreview
  projects/      Checklist · ChecklistItem · LeadButton · LeadPreview · ScanStatus
  gamification/  StreakBadge · ProgressBar · LevelMeter · BadgeGrid   (V2 : RecordPanel · MissionCard)
  settings/      LeadTemplateEditor · CommandEditor
```

### 3.3 Composables & utils
```
app/composables/  useApi · useTasks · useRoutines · useProjects · useIdeas
                  useSettings · useBridge · useGamification (V2)
app/utils/        dates.ts (FR, semaine lundi→dimanche) · prompt.ts · badges.ts
```

### 3.4 Critères « fait »
- UI intégralement en **français**
- **Desktop-first**, lisible et utilisable à 375 px
- États vides, de chargement et d'erreur systématiques
- Accessibilité : navigation clavier, focus visible, `aria-label` sur les icônes
- Aucun appel API direct depuis les pages — tout passe par les composables

---

## 4. Tests → sous-agent **Tester** (fin de module)

### 4.1 Jeux de tests E2E (Playwright + Fetch)
1. **Perso** — créer tâche datée → visible dans *Aujourd'hui* → cocher → barre remonte → streak +1
2. **Retard** — tâche d'hier non faite → report auto lendemain → affichée **en rouge** dans *Aujourd'hui*
3. **Routines** — créer routine *lun/mer/ven* → instance visible uniquement ces jours-là → désactiver → plus d'instances → réactiver
4. **Idées** — capture rapide depuis le dashboard → visible dans */idees*
5. **Dev** — créer projet + checklist → réordonner → bouton LEAD → `prompt.md` conforme
6. **Réglages** — modifier l'intro → aperçu mis à jour → LEAD utilise la nouvelle version
7. **Bridge** — `NUXT_PUBLIC_LOCAL_BRIDGE=false` → boutons LEAD/Rescan **désactivés avec explication**, zéro erreur console

### 4.2 Non couverts par E2E (testés manuellement par l'utilisateur)
- Exécution réelle du process `opencode`
- Exécution réelle de `brain`

---

## Partition des fichiers (obligatoire pour le parallélisme)

| Fichier / dossier | Piste |
|---|---|
| `docker-compose.yml` · `.env.example` · `drizzle.config.ts` · `db/**` | **DB** |
| `server/repositories/**` · `server/services/**` · `server/api/**` · `shared/types.ts` | **Backend** |
| `app/app.vue` · `app/layouts/**` · `app/pages/**` · `app/components/**` · `app/composables/**` · `app/utils/**` | **Frontend** |
| `nuxt.config.ts` · `package.json` · `tsconfig.json` · `assets/css/**` | **Lead** (moi) |
| Aucun fichier n'apparaît sur deux pistes simultanées. | |

---

## Contrats inter-pistes (figés ici)

**Types partagés** — `shared/types.ts`, écrit par Backend, importé par Frontend :
`Task` · `TaskInput` · `TaskStatus` · `Routine` · `RoutineInput` · `Project` · `ProjectTask` · `Idea` · `IdeaInput` · `Settings` · `GamificationSummary` · `Badge` · `Mission` · `BridgeStatus` · `LeadPreview`

**Conventions** :
- UUID côté serveur, `string` côté front
- Dates : `scheduled_date` = `YYYY-MM-DD` (pas de fuseau) ; `completed_at` = ISO 8601 UTC
- Toute route répond `{ data }` ou `{ error: { code, message } }`

---

## Sécurité & edge cases à couvrir

### Sécurité (prioritaire : le Local Bridge est une surface d'exécution de commande)
- **Injection de commande** : `folder_path` issu de la BDD **ne doit jamais** être concaténé dans un shell. Validation stricte : le chemin résolu doit être **à l'intérieur** de la racine dev configurée (`path.resolve` + contrôle de préfixe). Caractères interdits rejetés.
- **Exposition** : `/api/brain/*` et `/api/projects/[id]/lead` répondent `403` si `NUXT_PUBLIC_LOCAL_BRIDGE` est faux **ou** si l'origine n'est pas localhost.
- **Vercel** : `child_process` jamais importé au niveau module — chargé uniquement via `import()` conditionnel.
- **Secrets** : `DATABASE_URL` uniquement côté serveur ; jamais dans `public/` ni dans le payload client.
- **Pas d'auth** → aucune surface d'auth à auditer, mais le port dev restreint à `localhost` par défaut dans `nuxt.config.ts`.

### Edge cases
| Cas | Comportement attendu |
|---|---|
| Jour sans aucune tâche planifiée | **Neutre** : streak inchangé |
| Tâche en retard + tâches du jour | Retards en rouge **au-dessus**, tâches du jour en dessous |
| Routine désactivée | Plus d'instances générées ; les instances **déjà créées restent** |
| Routine éditée (jours) | Les instances **futures** suivent, les **passées** sont intouchables |
| Routine supprimée | Instances futures purgées, instances passées **conservées** |
| Double génération d'instance | Impossible : index unique `(routine_id, scheduled_date)` |
| Dossier `dev/` absent ou vide | Message d'erreur clair + bouton « ouvrir le dossier » |
| `brain` non installé / erreur | Bouton **désactivé** + commande à copier affichée, jamais d'échec silencieux |
| Projet renommé/déplacé dans `dev/` | Le rescan met à jour `folder_path` ; les tâches sont conservées si le nom correspond |
| `ossodev` absent de `dev/` | Normal — l'utilisateur le déplacera manuellement (D13). Aucun special-case |
| LEAD sur un projet à 0 tâche | Aperçu indique clairement « aucune tâche injectée », lancement autorisé |
| Template LEAD vide | Repli sur le template par défaut embarqué + bannière d'alerte |
| Double clic sur LEAD | Un seul terminal ouvert, un seul `lead_session` journalisé |
| Tâche créée pour hier | Apparaît immédiatement en **retard** |
| Changement de fuseau | `scheduled_date` en `DATE` pur (aucun décalage) |

---

## Ordre d'exécution

```
VAGUE 1  (parallèle)   [Database] ∥ [Frontend-Shell]
VAGUE 2  (parallèle)   [Backend-Perso] ∥ [Backend-Dev] ∥ [Frontend-Perso]
VAGUE 3  (parallèle)   [Backend-Bridge] ∥ [Backend-Gamif] ∥ [Frontend-Dev]
VAGUE 4  (parallèle)   [Frontend-Dashboard] ∥ [Backend-Settings]
VAGUE 5  (parallèle)   [Gamification V2 Backend] ∥ [Gamification V2 Frontend]
VAGUE 6                [Tester] — E2E complet
```

**Contrat-first** : le schéma DB et les types partagés étant figés dans ce plan, la Vague 1 peut démarrer les deux pistes **en simultané**.

---

## Validation finale

1. Chaque tâche auto-revêtue `AUTO-OK` et **commitée** (Conventional Commits, sérialisées).
2. `docker compose up -d` → `nuxt dev` → application utilisable de bout en bout.
3. `Tester` exécute les 7 scénarios E2E de §4.1.
4. Rapport final à l'utilisateur : fichiers touchés, statut des auto-revues, résultats E2E.

---

## Notes pour l'utilisateur

- **Gamification phasée** : V1 = points + streak + barre (utile dès le premier jour). V2 = badges + mission hebdo + records + page *Progrès*. La V2 peut partir dès validation de la V1.
- **Bouton LEAD, comportement exact** : clic → aperçu du prompt → validation → écriture de `prompt.md` dans le dossier du projet → copie du prompt dans le presse-papier → ouverture d'un terminal Windows déjà `cd`'é dans le dossier. La commande d'ouverture est **configurable dans Réglages** (on ne peut pas deviner la façon dont tu lances `opencode`).
- **Rescan brain** : même logique — commande configurable dans Réglages. Si elle échoue, le dashboard affiche la commande à copier au lieu de faire semblant de réussir.
