// Source de vérité UNIQUE de la navigation : le rail desktop (Sidebar) et le
// tiroir mobile (layouts/default) lisent ces mêmes groupes — jamais de
// duplication des libellés ni des chemins.

export interface NavItem {
  label: string
  to: string
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    title: "AUJOURD'HUI",
    items: [
      { label: 'Tableau de bord', to: '/' },
      { label: "Aujourd'hui", to: '/aujourdhui' },
      { label: 'Planifier', to: '/planifier' },
      { label: 'Routines', to: '/routines' },
    ],
  },
  {
    title: 'PROJETS',
    items: [
      { label: 'Idées', to: '/idees' },
      { label: 'Projets dev', to: '/projets' },
    ],
  },
  {
    title: 'SYSTÈME',
    items: [
      { label: 'Progrès', to: '/progres' },
      { label: 'Apprentissage', to: '/apprentissage' },
      { label: 'Réglages', to: '/reglages' },
    ],
  },
]
