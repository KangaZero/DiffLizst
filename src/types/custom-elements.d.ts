import type { Pages } from '@/components/pages'

declare global {
  interface HTMLElementTagNameMap {
    'page-pagination': Pages
  }
}

export {}
