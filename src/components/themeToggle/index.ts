import styles from './ThemeToggle.css?inline'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme-preference'
const MEDIA_QUERY = '(prefers-color-scheme: dark)'

const SUN_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">
    <circle cx="12" cy="12" r="4"/>
    <line x1="12" y1="2"  x2="12" y2="6"/>
    <line x1="12" y1="18" x2="12" y2="22"/>
    <line x1="2"  y1="12" x2="6"  y2="12"/>
    <line x1="18" y1="12" x2="22" y2="12"/>
    <line x1="4.93"  y1="4.93"  x2="7.76"  y2="7.76"/>
    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
    <line x1="4.93"  y1="19.07" x2="7.76"  y2="16.24"/>
    <line x1="16.24" y1="7.76"  x2="19.07" y2="4.93"/>
  </svg>
`

const MOON_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
`

const template = document.createElement('template')
template.innerHTML = `
  <style>${styles}</style>
  <button type="button" aria-label="Switch to dark theme">
    <slot name="icon">${SUN_ICON}</slot>
  </button>
  <span role="tooltip">Switch to dark theme</span>
`

export class ThemeToggle extends HTMLElement {
  private button!: HTMLButtonElement
  private tooltip!: HTMLSpanElement
  private iconSlot!: HTMLSlotElement
  private mediaQuery: MediaQueryList
  private root: HTMLElement

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.mediaQuery = window.matchMedia(MEDIA_QUERY)
    this.root = document.documentElement
  }

  connectedCallback() {
    this.shadowRoot!.appendChild(template.content.cloneNode(true))

    this.button = this.shadowRoot!.querySelector('button')!
    this.tooltip = this.shadowRoot!.querySelector('[role="tooltip"]')!
    this.iconSlot = this.shadowRoot!.querySelector('slot')!

    const saved = localStorage.getItem(STORAGE_KEY)
    const initial: Theme =
      saved === 'light' || saved === 'dark' ? saved : this.getSystemTheme()
    this.apply(initial)

    this.button.addEventListener('click', this.handleClick)
    this.mediaQuery.addEventListener('change', this.handleMediaChange)
  }

  disconnectedCallback() {
    this.button.removeEventListener('click', this.handleClick)
    this.mediaQuery.removeEventListener('change', this.handleMediaChange)
  }

  private getSystemTheme(): Theme {
    return this.mediaQuery.matches ? 'dark' : 'light'
  }

  private apply(theme: Theme, persist = false) {
    this.root.dataset.theme = theme
    const isDark = theme === 'dark'
    const label = isDark ? 'Switch to light theme' : 'Switch to dark theme'

    this.button.setAttribute('aria-pressed', String(isDark))
    this.button.setAttribute('aria-label', label)
    this.tooltip.textContent = label
    this.iconSlot.innerHTML = isDark ? MOON_ICON : SUN_ICON

    if (persist) localStorage.setItem(STORAGE_KEY, theme)
  }

  private handleClick = () => {
    const current = this.root.dataset.theme as Theme | undefined
    const next: Theme = current === 'dark' ? 'light' : 'dark'
    this.apply(next, true)
  }

  private handleMediaChange = (e: MediaQueryListEvent) => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      this.apply(e.matches ? 'dark' : 'light')
    }
  }
}

customElements.define('theme-toggle', ThemeToggle)
