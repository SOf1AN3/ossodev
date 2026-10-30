# PLAN-auth-page.md — Page de connexion réelle + bascule Companion vers Vercel

> **Statut** : EN ATTENTE DE VALIDATION.
> **Date** : 30/10/2026.
> **Plan antérieur** (V2 Companion/Teacher/Apprentissage) : `PLAN.md`, intégralement exécuté.

## Contexte & besoin métier

OSSO est désormais en production sur **https://ossodev.vercel.app**, protégé par un
**Basic Auth navigateur** (popup native). Deux demandes :

1. **Vraie page de connexion** — remplacer la popup par une page `/connexion` au design
   du dashboard (Graphite Chaud, thème sombre par défaut), avec le **même mot de passe**.
2. **Bascule du Companion** — il cible encore `http://localhost:3000`. Le pointer sur la
   production Vercel pour que la boucle Companion ↔ serveur ne dépende plus du serveur local.

### Décisions validées par l'utilisateur
| Sujet | Décision |
|---|---|
| Durée de session | **7 jours** |
| Basic Auth | **Remplacé entièrement** (cookie de session seule voie) |
| Force brute | **Throttling simple** en mémoire sur l'endpoint de login |

---

## 1. Sécurité — contrat de session (figé ici)

**Pas de nouvelle variable d'environnement.** La clé de signature est **dérivée** du mot
de passe déjà requis :

```
sessionKey = HMAC-SHA256(key = DASHBOARD_PASSWORD, msg = "osso-session-v1")
```

Justification : `DASHBOARD_PASSWORD` est déjà **fail-closed** (le middleware refuse tout
sans elle), donc la clé de session existe toujours ; et un changement de mot de passe
**invalide toutes les sessions** — comportement désiré. Un second secret oublié aurait
produit un lockout silencieux. Un attaquant qui connaît le mot de passe peut se
connecter directement : aucune surface d'attaque supplémentaire.

**Jeton de session** (cookie `osso_session`, sans état, signé HMAC-SHA256) :
```
valeur = "<exp_unix>.<hmac_hex>"      exp = maintenant + 7 jours (604800 s)
```
- Vérification : `timingSafeEqual` sur le HMAC, puis contrôle `exp > now`.
- Aucun état côté serveur → compatible serverless, pas d'infrastructure.

**Attributs du cookie** : `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`,
`secure: true` **uniquement en production** (sinon `nuxt dev` en HTTP casserait).

**Comparaison du mot de passe** : hachage SHA-256 des deux valeurs puis
`timingSafeEqual` (même technique que `server/utils/companionAuth.ts`).

**Exemptions du middleware** (les seules) :
| Chemin | Motif |
|---|---|
| `/connexion` | la page de login elle-même |
| `/api/auth/login`, `/api/auth/logout`, `/api/auth/session` | endpoints d'auth |
| `/api/companion/*` | authentifiés déjà par Bearer HMAC (`requireCompanionAuth`) |

**Comportement d'échec selon le type de requête** :
- `event.path` commence par `/api/` → **401 JSON** `{ error: { code, message } }`.
- Autre (navigation HTML) → **302** vers `/connexion`. Une 401 JSON sur une page serait
  illisible pour l'utilisateur.

---

## 2. Base de données
**Aucun changement.** Aucune table, aucune migration, aucun schéma Drizzle touché.

---

## 3. API Routes / Server Actions → sous-agent **Backend**

### 3.1 `server/utils/session.ts` — **à créer**
- `sessionKey()` : dérivation HMAC ci-dessus (lazy, mise en cache).
- `createSessionToken(now?)` : produit le jeton signé.
- `readSessionCookie(event)` / `writeSessionCookie(event, token)` / `clearSessionCookie(event)`.
- `isSessionValid(event)` : `boolean` — lit le cookie, vérifie HMAC puis expiration.
- Aucun `any`, TypeScript strict, commentaires en français expliquant le *pourquoi*.

### 3.2 `server/middleware/auth.ts` — **à modifier**
- Remplacer le Basic Auth par la vérification de session.
- Appliquer les exemptions et le branchement 401-JSON / 302-redirect du §1.
- Conserver le **fail-closed** : sans `DASHBOARD_PASSWORD`, tout est refusé (501).

### 3.3 `server/api/auth/login.post.ts` — **à créer**
- Corps `{ password: string }`, validé proprement (rejet si non textuel).
- Throttling en mémoire : `Map<ip, {fails, lockedUntil}>` ; après **5 échecs consécutifs**,
  pénalité progressive (1 s → 2 s → 4 s → … plafond 60 s) réinitialisée à la réussite.
- Comparaison en temps constant ; **message d'erreur unique et identique** que le mot de
  passe soit vide ou faux (pas d'oracle).
- Succès → cookie posé, `{ data: { ok: true } }`.

### 3.4 `server/api/auth/logout.post.ts` — **à créer**
- Supprime le cookie, `{ data: { ok: true } }`.

### 3.5 `server/api/auth/session.get.ts` — **à créer**
- `{ data: { authenticated: boolean } }`. Aucune donnée exposée.

---

## 4. UI Components → sous-agent **Frontend**

### 4.1 `app/pages/connexion.vue` — **à créer**
- `definePageMeta({ layout: false })` → hors du rail Sidebar/Topbar.
- Reprendre le design system existant (`app/assets/css/main.css`) : tokens `surface-*`,
  `ink-*`, `accent-*`, classe `micro`, police Schibsted Grotesk / JetBrains Mono.
- Un seul champ mot de passe + bouton, états : repos / envoi / erreur (401) / verrouillage.
- `autocomplete="current-password"`, focus accessible, `aria-live` sur l'erreur.
- Après succès → `navigateTo('/')`.
- **Ne devine pas** `DASHBOARD_PASSWORD` côté client : jamais de secret embarqué.

---

## 5. Bascule Companion → **Lead** (direct, hors sous-agents)

Le fichier contient le secret partagé : traité **par le Lead**, jamais transmis à un
sous-agent.

### 5.1 `%APPDATA%\osso-companion\config.json` — **à modifier**
`oss_url` → `https://ossodev.vercel.app`. **Le secret n'est pas régénéré** (rotation
casserait la signature HMAC côté Companion). Édition par script préservant `secret`.

### 5.2 `scripts/companion-init.mjs` — **à modifier**
`oss_url` par défaut (ligne 72) → l'URL Vercel, surchargeable par `NUXT_OSS_URL`.
Nécessaire car `companion-init.mjs:85` fait `{...defaults, ...previous, secret}` :
un défaut seul ne suffit pas à basculer une config existante.

---

## 6. Tests → sous-agent **Tester** (fin de module)

Flux E2E sur la production après déploiement :
1. `GET /` sans cookie → **302** vers `/connexion`.
2. `GET /connexion` → **200**, page rendue.
3. `POST /api/auth/login` mauvais mot de passe → **401**.
4. `POST /api/auth/login` bon mot de passe → **200** + cookie `osso_session` posé.
5. `GET /api/projects` avec le cookie → **200** (données Supabase).
6. `GET /api/companion/status` **sans** cookie → **200** (exemption vérifiée).
7. 5 logins erronés consécutifs → **429/401 avec pénalité** (throttling vérifié).

---

## Partition des fichiers (obligatoire pour le parallélisme)

| Fichier | Piste |
|---|---|
| `server/utils/session.ts` | Backend |
| `server/middleware/auth.ts` | Backend |
| `server/api/auth/login.post.ts` | Backend |
| `server/api/auth/logout.post.ts` | Backend |
| `server/api/auth/session.get.ts` | Backend |
| `app/pages/connexion.vue` | Frontend |
| `%APPDATA%\osso-companion\config.json` | Lead |
| `scripts/companion-init.mjs` | Lead |

**Aucun fichier ne figure sur deux pistes.** Backend et Frontend sont disjoint → lancement
simultané.

---

## Contrats inter-pistes (figés)

| Élément | Valeur |
|---|---|
| `POST /api/auth/login` | req `{ password: string }` → 200 `{ data: { ok: true } }` |
| Échec login | 401 `{ error: { code: 'UNAUTHORIZED', message: string } }` |
| Verrouillage | 429 `{ error: { code: 'RATE_LIMITED', message: string } }` |
| `POST /api/auth/logout` | → 200 `{ data: { ok: true } }` |
| `GET /api/auth/session` | → 200 `{ data: { authenticated: boolean } }` |
| Cookie | `osso_session`, HttpOnly, SameSite=Lax, Path=/, Secure en prod |
| Redirection non authentifié | `/connexion` |
| Enveloppe d'erreur | `{ error: { code, message } }` — identique à `server/utils/http.ts` |

---

## Ordre d'exécution
1. **Backend ∥ Frontend** (fichiers disjoints, contrats figés) + **Lead** sur la bascule Companion.
2. Commit + push → build Vercel auto.
3. **Tester** sur la production.

## Validation finale
Revue auto des sous-agents (`AUTO-OK`) → commit sérialisé → push → E2E par le Tester.

## Limites assumées (honnêteté)
- Le **throttling est en mémoire** : sur serverless Vercel, l'état est par instance et
  éphémère. C'est une **protection de première ligne, pas une garantie**. Un attaquant
  patient avec beaucoup d'instances atteignables pourrait contourner. Pour une garantie
  ferme il faudrait un store partagé (Upstash Redis) — hors périmètre ici, à noter.
- Le **Basic Auth disparaît** : aucun accès CLI/scripts par en-tête. Si un usage en
  découle, il faudra réintroduire une voie dédiée.
