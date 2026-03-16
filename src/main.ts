// INFO: Global stylesheet
import './style.css'
//INFO: Components - notation
import './components/notation/note'
//INFO: Components - others
import './components/themeToggle'
import typescriptLogo from './assets/typescript.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import { setupCounter } from './counter.ts'
import * as verovio from 'verovio'
import type { VerovioOptions } from 'verovio'
import { setNotationSVGIDToIndexBase } from './utils/setNotationSVGIDToIndexBase.ts'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('App root element not found')
}

app.innerHTML = `
<header id="toolbar" >
  <span class="app-title"> MusicDiff </span>
  <theme-toggle> </theme-toggle>
</header>
<section id="center">
  <button
      id="theme-toggle"
      class="theme-toggle"
      type="button"
      aria-label="Toggle color theme"
      aria-pressed="false"
    >
      <span class="theme-toggle-track" aria-hidden="true">
        <span class="theme-toggle-thumb"></span>
      </span>
      <span id="theme-toggle-label">Theme: Light</span>
    </button>
    <div class="hero">
      <img src="${heroImg}" class="base" width="170" height="179" alt="Decorative background" />
      <img src="${typescriptLogo}" class="framework" alt="TypeScript logo" />
      <img src="${viteLogo}" class="vite" alt="Vite logo" />
    </div>
    <div>
      <h1>Get started</h1>
      <p>Edit <code>src/main.ts</code> and save to test <code>HMR</code></p>
    </div>
    <button id="counter" type="button" class="counter"></button>
  </section>

  <div class="ticks"></div>

  <section id="next-steps">
    <div id="docs">
      <svg class="icon" role="presentation" aria-hidden="true">
        <use href="/icons.svg#documentation-icon"></use>
      </svg>
      <h2>Documentation</h2>
      <p>Your questions, answered</p>
      <div class="notation-panel">
        <div class="notation-controls">
          <label for="notation-scale">Scale</label>
          <input
            id="notation-scale"
            type="range"
            min="40"
            max="140"
            step="5"
            value="80"
          />
          <output id="notation-scale-value" for="notation-scale">80%</output>
        </div>
        <div id="XML-notation" class="notation-stage">Loading score...</div>
      </div>
      <ul>
        <li>
          <a href="https://vite.dev/" target="_blank" rel="noreferrer">
            <img class="logo" src="${viteLogo}" alt="" />
            Explore Vite
          </a>
        </li>
        <li>
          <a href="https://www.typescriptlang.org" target="_blank" rel="noreferrer">
            <img class="button-icon" src="${typescriptLogo}" alt="" />
            Learn more
          </a>
        </li>
      </ul>
    </div>
    <div id="social">
      <svg class="icon" role="presentation" aria-hidden="true">
        <use href="/icons.svg#social-icon"></use>
      </svg>
      <h2>Connect with us</h2>
      <p>Join the Vite community</p>
      <ul>
        <li>
          <a href="https://github.com/vitejs/vite" target="_blank" rel="noreferrer">
            <svg class="button-icon" role="presentation" aria-hidden="true">
              <use href="/icons.svg#github-icon"></use>
            </svg>
            GitHub
          </a>
        </li>
        <li>
          <a href="https://chat.vite.dev/" target="_blank" rel="noreferrer">
            <svg class="button-icon" role="presentation" aria-hidden="true">
              <use href="/icons.svg#discord-icon"></use>
            </svg>
            Discord
          </a>
        </li>
        <li>
          <a href="https://x.com/vite_js" target="_blank" rel="noreferrer">
            <svg class="button-icon" role="presentation" aria-hidden="true">
              <use href="/icons.svg#x-icon"></use>
            </svg>
            X.com
          </a>
        </li>
        <li>
          <a href="https://bsky.app/profile/vite.dev" target="_blank" rel="noreferrer">
            <svg class="button-icon" role="presentation" aria-hidden="true">
              <use href="/icons.svg#bluesky-icon"></use>
            </svg>
            Bluesky
          </a>
        </li>
      </ul>
    </div>
  </section>

  <div class="ticks"></div>
  <section id="spacer"></section>
`

setupCounter(document.querySelector<HTMLButtonElement>('#counter')!)

const root = document.documentElement
const notationContainer = document.querySelector<HTMLDivElement>('#XML-notation')
const notationScaleInput = document.querySelector<HTMLInputElement>('#notation-scale')
const notationScaleValue = document.querySelector<HTMLOutputElement>('#notation-scale-value')
const themeToggleButton = document.querySelector<HTMLButtonElement>('#theme-toggle')
const themeToggleLabel = document.querySelector<HTMLSpanElement>('#theme-toggle-label')

if (!notationContainer || !notationScaleInput || !notationScaleValue || !themeToggleButton || !themeToggleLabel) {
  throw new Error('App controls not found')
}

type Theme = 'light' | 'dark'

let meiXML: string | null = null
let toolkit: verovio.toolkit | null = null
const themeStorageKey = 'theme-preference'
const themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

const getSystemTheme = (): Theme => (themeMediaQuery.matches ? 'dark' : 'light')

const syncThemeToggle = (theme: Theme) => {
  const isDark = theme === 'dark'
  themeToggleButton.setAttribute('aria-pressed', String(isDark))
  themeToggleLabel.textContent = `Theme: ${isDark ? 'Dark' : 'Light'}`
}

const applyTheme = (theme: Theme, persist = false) => {
  root.dataset.theme = theme
  syncThemeToggle(theme)

  if (persist) {
    window.localStorage.setItem(themeStorageKey, theme)
  }
}

const savedTheme = window.localStorage.getItem(themeStorageKey)

if (savedTheme === 'light' || savedTheme === 'dark') {
  applyTheme(savedTheme)
} else {
  syncThemeToggle(getSystemTheme())
}

themeToggleButton.addEventListener('click', () => {
  const currentTheme = (root.dataset.theme as Theme | undefined) ?? getSystemTheme()
  const nextTheme: Theme = currentTheme === 'dark' ? 'light' : 'dark'

  applyTheme(nextTheme, true)
})

themeMediaQuery.addEventListener('change', (event) => {
  if (window.localStorage.getItem(themeStorageKey)) {
    return
  }

  syncThemeToggle(event.matches ? 'dark' : 'light')
})

const updateScaleLabel = (scale: number) => {
  if (scale > 1000) return console.error('Maximum is 1000')
  if (scale < 1) return console.error('Minimum is 1')
  notationScaleValue.value = `${scale}%`
  notationScaleValue.textContent = `${scale}%`
}

const renderNotation = () => {
  if (!toolkit || !meiXML) {
    return
  }

  const scale = Number(notationScaleInput.value)
  const options: VerovioOptions = {
    adjustPageHeight: true,
    breaks: 'auto',
    scale,
    //INFO: This does not matter, as the id will be set to index-base in the setNotationSVGIDToIndexBase fn
    xmlIdSeed: 1,
    useFacsimile: true
  }

  notationContainer.innerHTML = toolkit.renderData(meiXML, options)
  setNotationSVGIDToIndexBase(notationContainer)
}

updateScaleLabel(Number(notationScaleInput.value))
notationScaleInput.addEventListener('input', () => {
  const scale = Number(notationScaleInput.value)
  updateScaleLabel(scale)
  renderNotation()
})

const resizeObserver = new ResizeObserver(() => {
  renderNotation()
})

resizeObserver.observe(notationContainer)

verovio.module.onRuntimeInitialized = async () => {
  toolkit = new verovio.toolkit()

  try {
    const response = await fetch('https://www.verovio.org/examples/downloads/Schubert_Lindenbaum.mei')

    if (!response.ok) {
      throw new Error(`Failed to load MEI data: ${response.status} ${response.statusText}`)
    }

    meiXML = await response.text()
    renderNotation()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    notationContainer.textContent = `Unable to load score: ${message}`
  }
}
