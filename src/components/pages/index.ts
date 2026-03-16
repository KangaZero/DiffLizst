// import styles from './pages.css?inline'
import { getTotalPageCount } from '@/utils/getTotalPageCount'
import type { toolkit as Toolkit } from 'verovio'

const template = document.createElement('template')

// < !-- < style > ${ styles }</style> -->
template.innerHTML = `
  <div class="container" part="container" role="navigation" aria-label="Pagination"></div>
`

export class Pages extends HTMLElement {
  private _total: number = 1
  private _page: number = 1
  private container!: HTMLDivElement
  // INFO: These two properties are based in by the parent as params to be used to re-render the SVG based on current page
  public toolkit: Toolkit | null = null
  public notationContainer: HTMLDivElement | null = null

  static get observedAttributes() {
    return ['total', 'page']
  }

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.shadowRoot!.appendChild(template.content.cloneNode(true))
    this.container = this.shadowRoot!.querySelector('.container') as HTMLDivElement
  }

  connectedCallback() {
    // initialize from attributes if present
    const totalAttr = this.getAttribute('total')
    if (totalAttr) this.total = Number(totalAttr)

    const pageAttr = this.getAttribute('page')
    if (pageAttr) this.page = Number(pageAttr)

    this.render()
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
    if (name === 'total') {
      this.total = Number(newValue) || 1
    }
    if (name === 'page') {
      this.page = Number(newValue) || 1
    }
    this.render()
  }

  set total(val: number) {
    const n = Number(val) || 1
    this._total = Math.max(1, Math.floor(n))
    if (this._page > this._total) this._page = this._total
    this.render()
  }

  get total() {
    // if toolkit is provided, prefer computing via util
    if (this.toolkit) {
      try {
        const computed = getTotalPageCount(this.toolkit)
        if (typeof computed === 'number' && computed >= 1) {
          return computed
        } else {
          console.error(`Total amount of pages is either not a number or below 1: ${computed}`)
        }
      } catch (error) {
        console.error('Error computing total pages:', error)
      }
    }
    console.warn(`Toolkit is not provided: ${this.toolkit}`)
    return this._total
  }

  set page(val: number) {
    const n = Number(val) || 1
    // clamp
    this._page = Math.min(this.total, Math.max(1, Math.floor(n)))
    this.render()
    this.updateNotationPage()

  }

  get page() {
    return this._page
  }

  private emitChange() {
    this.dispatchEvent(new CustomEvent('page-change', { detail: { page: this.page }, bubbles: true }))
  }

  private createButton(label: string | number, ariaCurrent = false, disabled = false): HTMLButtonElement {
    const btn = document.createElement('button') as HTMLButtonElement
    btn.className = typeof label === 'number' ? 'page-btn' : 'control'
    btn.type = 'button'
    btn.textContent = String(label)
    if (ariaCurrent) btn.setAttribute('aria-current', 'true')
    if (disabled) btn.disabled = true
    return btn
  }

  private pageList(): Array<number | '...'> {
    const total = this.total
    const current = this.page
    const pages: Array<number | '...'> = []

    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i)
      return pages
    }

    // Always show first
    pages.push(1)

    const left = Math.max(2, current - 2)
    const right = Math.min(total - 1, current + 2)

    if (left > 2) pages.push('...')

    for (let i = left; i <= right; i++) pages.push(i)

    if (right < total - 1) pages.push('...')

    pages.push(total)

    return pages
  }

  private clear() {
    while (this.container.firstChild) this.container.removeChild(this.container.firstChild)
  }

  private updateNotationPage() {
    if (!this.toolkit) return console.error(`Missing toolkit, cannot updateNotationPage`)
    if (!this.notationContainer) return console.error(`Missing notationContainer, cannot updateNotationPage`)
    //WARNING: the renderToSVG() is already slow, enabling redoLayout() makes it even slower, consider having the user manually reseting the layout via a button
    // this.toolkit.redoLayout();
    this.notationContainer.innerHTML = this.toolkit.renderToSVG(this.page)
    console.trace(this.toolkit)
  }

  render() {
    this.clear()
    const total = this.total
    const current = this.page

    // Prev
    const prev = this.createButton('<')
    prev.classList.add('control')
    prev.disabled = current <= 1
    prev.addEventListener('click', () => {
      if (this.page > 1) {
        this.page = this.page - 1
        this.emitChange()
      }
    })
    this.container.appendChild(prev)

    // Pages
    const pages = this.pageList()
    pages.forEach((p) => {
      if (p === '...') {
        const el = document.createElement('span')
        el.className = 'ellipsis'
        el.textContent = '…'
        this.container.appendChild(el)
        return
      }

      const btn = this.createButton(p, p === current)
      if (p === current) btn.disabled = true
      btn.addEventListener('click', () => {
        if (this.page === Number(p)) return
        this.page = Number(p)
        this.emitChange()
      })
      this.container.appendChild(btn)
    })

    // Next
    const next = this.createButton('>')
    next.classList.add('control')
    next.disabled = current >= total
    next.addEventListener('click', () => {
      if (this.page < this.total) {
        this.page = this.page + 1
        this.emitChange()
      }
    })
    this.container.appendChild(next)
  }
}

customElements.define('page-pagination', Pages)
