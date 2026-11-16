import { AppWindow } from 'lucide-react'
import { useEffect } from 'react'
import { Toast } from '../components/ui/Toast'
import { useBrowserState, useSettings, useTheme } from '../state'

// Document de la vue native de l'avis « pop-up bloquée » (?vue=popup, ARB-108), en bas à gauche de la page. Le processus
// principal l'affiche 6 s et la retire ; « Autoriser » mémorise le site, la croix ferme.
export function PopupNoticeView() {
  useTheme()
  useSettings()
  const { popupsBloquees } = useBrowserState()
  useEffect(() => { document.documentElement.classList.add('vue-popup') }, [])

  return (
    <Toast testId="popup-notice" icone={<AppWindow size={16}/>} message={popupsBloquees > 1 ? `${popupsBloquees} pop-ups bloquées` : 'Pop-up bloquée'}
      action={{ libelle: 'Autoriser', onClick: () => void window.arbalete.allowPopups() }} onClose={() => void window.arbalete.closePopupNotice()}/>
  )
}
