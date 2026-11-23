import type { RefObject } from 'react'
import { Monitor, Moon, Plus, Sun } from 'lucide-react'
import type { PermissionSite } from '../../../shared/permissions'
import type { BrowserTab, ThemeChoice } from '../../../shared/types'
import { AddressBar } from './AddressBar'
import { ExtensionActions } from './ExtensionActions'
import { NavigationControls } from './NavigationControls'
import { PinButton } from './PinButton'
import { IconButton } from './ui/IconButton'

const nextTheme: Record<ThemeChoice, ThemeChoice> = { system: 'dark', dark: 'light', light: 'system' }

type ToolbarProps = {
  activeTab: BrowserTab | undefined
  sidebarPinned: boolean
  themeChoice: ThemeChoice
  favorite: boolean
  extensionsPartition: string | null // null : extensions éteintes
  popupsBloquees: number
  permissionsUtilisees: PermissionSite[]
  address: string
  addressRef: RefObject<HTMLInputElement | null>
  onAddressChange: (value: string) => void
  onAddressFocusChange: (focused: boolean) => void
  onNavigate: () => void
}

export function Toolbar({
  activeTab,
  sidebarPinned,
  themeChoice,
  favorite,
  extensionsPartition,
  popupsBloquees,
  permissionsUtilisees,
  onNavigate,
  ...address
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <PinButton pinned={sidebarPinned} />
      <NavigationControls activeTab={activeTab} />
      <AddressBar
        {...address}
        onSubmit={onNavigate}
        favorite={favorite}
        popupsBloquees={popupsBloquees}
        permissionsUtilisees={permissionsUtilisees}
        favoritable={/^https?:/i.test(activeTab?.url ?? '')}
      />
      {extensionsPartition && <ExtensionActions partition={extensionsPartition} />}
      <IconButton variant="secondary" title="Nouvel onglet" onClick={() => void window.arbalete.createTab()}>
        <Plus size={16} />
      </IconButton>
      <IconButton
        variant="secondary"
        title="Thème : changer le mode"
        onClick={() => void window.arbalete.setTheme(nextTheme[themeChoice])}
      >
        {themeChoice === 'system' ? (
          <Monitor size={16} />
        ) : themeChoice === 'dark' ? (
          <Moon size={16} />
        ) : (
          <Sun size={16} />
        )}
      </IconButton>
    </header>
  )
}
