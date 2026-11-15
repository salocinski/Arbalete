import { useLayoutEffect, useRef, useState } from 'react'
import { TabItem } from './TabItem'
import type { BrowserState } from '../../../shared/types'

// onMenu : clic droit sur un onglet, avec la position du pointeur dans la vue (menu de l'onglet, ARB-39).
// groupe : les onglets épinglés (ARB-64) ou ceux du jour ; sans groupe, tous. Le déplacement vise l'index de l'onglet dans
// la liste complète de l'espace, épinglés en tête.
export function TabList({ state, onMenu, groupe }: { state: BrowserState; onMenu?: (tabId: string, x: number, y: number) => void; groupe?: 'epingles' | 'jour' }) {
  const liste = useRef<HTMLDivElement>(null)
  const [tenu, setTenu] = useState<string | null>(null) // onglet en cours de glissement (ARB-68)
  const positions = useRef(new Map<string, number>())
  // Les positions ne changent que si la liste des identifiants change, pas à chaque mise à jour de titre ou d'état.
  const affiches = groupe ? state.tabs.filter((tab) => !!tab.pinned === (groupe === 'epingles')) : state.tabs
  const cleOrdre = affiches.map((tab) => tab.id).join()

  // Réorganisation animée (DESIGN.md, Motion : 160 ms) : technique FLIP, chaque onglet déplacé part de son ancienne
  // position et glisse vers la nouvelle. prefers-reduced-motion coupe la transition (styles.css).
  useLayoutEffect(() => {
    const apres = new Map<string, number>()
    for (const el of liste.current?.querySelectorAll<HTMLElement>('.tab-item') ?? []) {
      const id = el.dataset.tabId!
      const haut = el.offsetTop
      apres.set(id, haut)
      const avant = positions.current.get(id)
      if (avant === undefined || avant === haut) continue
      el.style.transition = 'none'
      el.style.transform = `translateY(${avant - haut}px)`
      el.getBoundingClientRect() // force le calcul de style avant de lancer la transition
      el.style.transition = ''
      el.style.transform = ''
    }
    positions.current = apres
  }, [cleOrdre])

  return (
    <div className="tab-list" ref={liste}>
      {affiches.map((tab) => ({ tab, index: state.tabs.indexOf(tab) })).map(({ tab, index }) => <TabItem key={tab.id} tab={tab} active={tab.id === state.activeTabId}
        drag={{ dragging: tenu === tab.id, onDragStart: () => setTenu(tab.id), onDragEnd: () => setTenu(null),
          onDrop: (id) => { if (id) void window.arbalete.moveTab(id, index); setTenu(null) } }}
        onSelect={() => void window.arbalete.activateTab(tab.id)} onClose={() => void window.arbalete.closeTab(tab.id)}
        onMenu={(x, y) => onMenu?.(tab.id, x, y)} />)}
    </div>
  )
}
