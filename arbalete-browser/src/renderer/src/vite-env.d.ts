/// <reference types="vite/client" />
import type { DetailedHTMLProps, HTMLAttributes } from 'react'
import type { BrowserAPI } from '../../shared/types'

declare global {
  interface Window {
    arbalete: BrowserAPI
  }
}
// Élément personnalisé défini par le preload (ARB-160).
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'browser-action-list': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & { partition?: string }
    }
  }
}
export {}
