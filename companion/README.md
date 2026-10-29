# OSSO Companion

App autonome Windows (Node 24, **zéro dépendance de runtime**) : un processus en
tâche de fond qui interroge l'API OSSO toutes les ~7 s et exécute localement les
commandes du dashboard — ouverture d'un terminal **LEAD** et **rescan brain**.
C'est ce qui rend OSSO utilisable depuis Vercel : le serveur ne parle qu'à la
file, c'est ce poste qui agit sur le disque.

## Démarrage

```bash
cd companion
npm install        # devDependencies uniquement (typescript, @types/node)
npm run dev        # tray + boucle de polling (rechargement auto)
npm run start      # idem sans --watch
npm run typecheck  # tsc --noEmit
npm run register   # crée la tâche planifiée « à la connexion », sans fenêtre
```

> **`npm run register` exige un terminal administrateur** : Windows refuse la
> création d'une tâche `ONLOGON` sans token admin délégué (UAC), même pour un
> compte Administrateurs en session standard. Un seul passage admin à la
> création — la tâche tourne ensuite en standard à chaque connexion. Le script
> le signale lui-même avec la procédure exacte.

Prérequis : le fichier `%APPDATA%\osso-companion\config.json` doit exister —
il est généré par `node scripts/companion-init.mjs` depuis la racine OSSO.
Le secret y est stocké ; il n'est **jamais** présent dans ce dépôt ni dans les
journaux.

## Architecture

| Fichier | Rôle |
|---|---|
| `src/index.ts` | Boucle : config → tray → heartbeat → claim → exécution séquentielle → complete, back-off, arrêt propre (SIGINT/SIGTERM) |
| `src/config.ts` | Lecture de `%APPDATA%\osso-companion\config.json` + journal (rotation 1 Mo, masquage du secret) |
| `src/security.ts` | **Cœur** : liste blanche `ALLOWED_KEYS`, `assertSafeAbsolutePath` (allowlist + confinement `dev_root`), `verifySignature` (HMAC + fraîcheur 120 s) |
| `src/signature.ts` | HMAC-SHA256 (`id\|command_key\|payload\|expires_at`), comparaison à temps constant |
| `src/api.ts` | `heartbeat` / `claim` / `complete` / `sendBrainResult` — fetch natif, timeout 10 s |
| `src/tray.ts` | Icône + menu (Ouvrir le dashboard · Statut · Quitter), sans fenêtre principale |
| `src/commands/lead.ts` | Valide le chemin → écrit `prompt.md` → copie le prompt (best effort) → ouvre le terminal |
| `src/commands/brainScan.ts` | `readdir(dev_root)` **lecture seule** → marqueurs → POST brain-result |
| `src/commands/brainRun.ts` | Exécute `brain_command` **pris dans la config locale**, `cwd = dev_root`, `shell: false` |
| `scripts/register-task.ts` | Tâche planifiée Windows « à la connexion » via `schtasks` (args en tableau, sans admin) |

## Sécurité (D8)

1. **Liste blanche locale** : `opencode:lead`, `brain:scan`, `brain:run` —
   constante du code, jamais étendue depuis une réponse réseau.
2. **Signature HMAC-SHA256** vérifiée **par le Companion** avant toute exécution ;
   un message de plus de 120 s est refusé même si la signature est valide
   (pas de comparaison d'horloge avec `expires_at`).
3. **Validation de chemin en deux temps** : allowlist
   (`/^[A-Za-z]:[A-Za-z0-9 _.\-\\\/]+$/`, rejets `\0`/`\n`/`\r` avant le regex)
   puis confinement strict dans `dev_root` après `path.resolve`.
4. **`shell: false` partout** — les commandes sont passées en tableau d'args,
   jamais concaténées dans une chaîne interprétée par un shell.
5. Le Companion ne lit ni ne stocke aucun secret Supabase.

## Choix du tray : PowerShell `NotifyIcon` (écrit ici, pas un paquet npm)

Paquets vérifiés sur le registre npm avant de décider :

| Paquet | Dernière modif | Verdict |
|---|---|---|
| `systray2` | 2022-05-19 | Abandonné (4 ans), binaire Go téléchargé |
| `systray` | 2022-06-27 | Abandonné |
| `@3xpo/systray` | 2024-03-23 | 2,5 ans sans publication, dépendance `systray-bin` qui télécharge un binaire |
| `tray-icon-node` | 2026-07-22 | Bindings **Rust** (cargo/clippy) — Rust absent de la machine |
| `@1-week/trayicon-bun` | 2026-05-19 | Bun uniquement |

Aucun n'est à la fois fiable, maintenu et sans Rust/Python/binaire téléchargé.
Comme le prévoyait le PLAN (§0, repli `NotifyIcon`), le tray est **écrit ici** :
un script PowerShell `-EncodedCommand` (UTF-16LE base64, zéro problème de
quoting) qui affiche un `NotifyIcon` + menu, piloté par Node. **Aucune
dépendance npm de runtime.**

## Journal

`%APPDATA%\osso-companion\log.txt` — rotation à 1 Mo (`log.old.txt`), une ligne
par événement, secret systématiquement masqué, jamais le prompt complet
(seule sa longueur est notée).

## Notes d'implémentation

- **Ouverture du terminal** : la forme `start "" cmd /k "<corps>"` avec
  `windowsVerbatimArguments: true` a été validée empiriquement sur cette
  machine (la forme brute en tableau échoue : Node échappe les guillemets
  d'une façon que `cmd.exe` ne comprend pas). Le corps entre guillemets fait
  en sorte que `&&` soit interprété par le `cmd /k` fils.
- **Back-off** : 3 échecs consécutifs → intervalle doublé (max 60 s) ; un
  cycle réussi revient à l'intervalle de base.
- **Exécution séquentielle stricte** : un cycle en cours bloque le suivant,
  et les commandes d'un claim sont traitées dans l'ordre, une à la fois.
