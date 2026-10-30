# PLAN-responsive.md — Adaptation mobile (320-430px)

> **Statut** : EN ATTENTE DE VALIDATION.
> **Date** : 30/10/2026.
> **Périmètre validé** : corriger le responsive (pas de refonte en app mobile) ·
> navigation par **menu hamburger en panneau** · priorité aux **téléphones 320-430px**.

## Contexte & besoin métier

Le dashboard est conçu desktop-first. Mesuré sur la **production** avec Playwright,
viewport mobile réel, une fois connecté.

## Constats mesurés (aucun n'est une hypothèse)

| # | Problème | Mesure | Cause racine |
|---|---|---|---|
| 1 | **6 sections inatteignables sur mobile** | 3 liens affichés / 9 existants | `app/layouts/default.vue:6-10` — `compactLinks` |
| 2 | **Scroll horizontal à 320px** | `scrollWidth` 316 > `clientWidth` 310 | Topbar : rangée instruments à `right: 316` |
| 3 | Nav compacte coupée à 320px | 349px de contenu pour 310px | lien « Réglages » à `right: 333` |
| 4 | Fil d'Ariane tronqué | `scrollWidth > clientWidth` | instruments trop larges + `px-8` |
| 5 | Contenu utile : **246px sur 310px** | 64px gaspillés (20 %) | `main` en `p-8` |
| 6 | Cartes du dashboard étouffées | `px-8 py-7` de padding interne | `index.vue:284,313` |
| 7 | Toast hors écran à gauche | `left: -16` | `w-full max-w-sm` + `right-4` |
| 8 | `min-w` rigides | 190 / 210 / 220px | `JourWidget:29`, `index.vue:354`, `progres.vue:144` |

### ⚠️ Régression assumée : le problème 2 est de mon fait
Le **bouton de déconnexion** ajouté au commit `5108c4d` fait déborder la Topbar de 6px
à 320px. Sans lui, le Topbar tenait. C'est prioritaire et je le traite en premier.

---

## 1. Contrat de navigation (figé ici)

**Source de vérité unique** des 9 destinations, extraite pour ne pas la dupliquer
entre le rail desktop et le drawer mobile (sinon divergence garantie à terme).

```ts
// app/utils/navigation.ts
export interface NavItem { label: string; to: string }
export interface NavGroup { title: string; items: NavItem[] }
export const NAV_GROUPS: readonly NavGroup[]  // les 3 groupes, 9 items
```
Repris **à l'identique** par `Sidebar.vue` (rail desktop, comportement inchangé)
et par le drawer mobile.

**État du panneau** :
```ts
// app/composables/useMobileNav.ts
export function useMobileNav(): {
  isOpen: Ref<boolean>
  open: () => void
  close: () => void
  toggle: () => void
}
```
Store réactif module-scope (même technique que `useToast.ts`) : le bouton du
Topbar et le panneau du layout ne sont **pas** dans le même sous-arbre Vue, un
`ref` local ne suffirait pas.

**Comportement du drawer** :
- Visible **uniquement sous `lg`** (`lg:hidden`) — le rail desktop reste tel quel au-dessus.
- Panneau latéral gauche, **contenu des 3 groupes**, mêmes libellés que le rail.
- Fermeture par : clic sur le voile, touche `Échap`, ou sélection d'un lien.
- Accessibilité : `aria-expanded` sur le bouton, `aria-modal` + `role="dialog"` sur
  le panneau, **piège de focus** (Tab boucle dans le panneau), focus rendu au
  bouton à la fermeture. Sans piège de focus, un utilisateur au clavier s'échappe
  dans la page masquée derrière.

---

## 2. Fichiers — piste **Navigation** (sous-agent A)

| Fichier | Action |
|---|---|
| `app/utils/navigation.ts` | créer — source de vérité des 9 liens |
| `app/composables/useMobileNav.ts` | créer — état partagé |
| `app/components/layout/Topbar.vue` | modifier — bouton hamburger `lg:hidden`, masquage horloge + fil d'Ariane sous `sm`, `px-8` → `px-4 sm:px-6 lg:px-8` |
| `app/layouts/default.vue` | modifier — drawer + voile, **suppression de la nav compacte** (redondante avec le drawer), `main` : `p-8` → `p-4 sm:p-6 lg:p-8` |
| `app/components/layout/Sidebar.vue` | modifier — importer `NAV_GROUPS` (comportement **strictement identique**) |

**Suppression de la nav compacte** : le drawer donne accès aux 9 destinations, la
barre à 3 liens devient redondante **et** occupe de la hauteur précieuse. Elle
disparaît.

**Masquage du fil d'Ariane sous `sm`** : déjà tronqué (constat 4). Le titre de page
est rappelé par le `h1` du contenu — aucun information perdue.

---

## 3. Fichiers — piste **Débordements** (sous-agent B)

| Fichier | Action |
|---|---|
| `app/components/ui/ToastHost.vue` | modifier — `right-4` → `inset-x-4 sm:inset-x-auto sm:right-4`, et `max-w-sm` respecté sous `sm` |
| `app/pages/index.vue` | modifier — cartes hero : `px-8 py-7` → `px-4 py-5 sm:px-8 sm:py-7` ; `gap-8` → `gap-5 sm:gap-8` |
| `app/pages/progres.vue` | modifier — `min-w-[220px]` → `min-w-0` avec repli `sm:min-w-[220px]` |
| `app/components/dashboard/JourWidget.vue` | modifier — `min-w-[190px]` → `min-w-0` sous `lg` |

**Règle appliquée partout** : une largeur **minimale** ne doit jamais forcer un
scroll horizontal. `min-w-0` est la solution correcte en Flex/Grid pour laisser
un enfant se comprimer au lieu de déborder.

---

## 4. Partition des fichiers (parallélisme)

| Piste | Fichiers |
|---|---|
| **A — Navigation** | `app/utils/navigation.ts`, `app/composables/useMobileNav.ts`, `app/components/layout/Topbar.vue`, `app/layouts/default.vue`, `app/components/layout/Sidebar.vue` |
| **B — Débordements** | `app/components/ui/ToastHost.vue`, `app/pages/index.vue`, `app/pages/progres.vue`, `app/components/dashboard/JourWidget.vue` |

**Aucun fichier commun.** Lancement simultané.

---

## 5. Sécurité & accessibilité à couvrir
- Piège de focus + `aria-expanded` + `Échap` sur le drawer (voir §1).
- Aucune donnée ni secret côté client — travail **uniquement** sur les classes et le template.
- Le thème clair doit rester lisible : les classes ajoutées ne doivent utiliser
  que des tokens existants de `main.css` (vérifié : `surface-*`, `ink-*`, `line`).

## 6. Critères de « fait »
1. **Plus aucun scroll horizontal** à 320px sur `/`, `/progres`, `/projets`, `/apprentissage`.
2. **Les 9 sections accessibles** depuis un mobile via le drawer.
3. Contenu utile à 320px : **≥ 288px** (aujourd'hui 246px).
4. Le rail desktop (`lg+`) est **strictement inchangé** (aucune régression visuelle).
5. `npm run typecheck` et `npm run typecheck:server` verts.

## 7. Ordre d'exécution
1. Piste **A ∥ B** (fichiers disjoints).
2. Commit sérialisé + push → build Vercel auto.
3. Mesure de non-régression par Playwright sur 320 / 375 / 430 px, puis
   vérification desktop 1280px.

## 8. Limites assumées
- Le rail desktop conserve sa liste **propre** tant que `NAV_GROUPS` n'est pas
  intégralement adopté — la piste A le fait, mais si elle échoue, la duplication
  subsiste plutôt que de casser le rail.
- Le geste de balayage (swipe) pour ouvrir le panneau n'est **pas** prévu : c'est
  une refonte mobile, hors périmètre validé.
