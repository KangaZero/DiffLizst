// INFO: Global stylesheet
import "./style.css";
//INFO: Components - notation
import "./components/notation/note";
//INFO: Components - others
import "./components/themeToggle";
import "./components/pages";
//INFO: Utils
import { setNotationSVGIDToIndexBase } from "@/utils/setNotationSVGIDToIndexBase";
import { getTotalPageCount } from "@/utils/getTotalPageCount";
import { diffXML } from "@/utils/diffXML";
import { applyDiffHighlights } from "@/utils/applyDiffHighlights";
//TODO: Remove below
import typescriptLogo from "@/assets/typescript.svg";
import viteLogo from "@/assets/vite.svg";
import heroImg from "@/assets/hero.png";

import * as verovio from "verovio";
import { type VerovioOptions, toolkit as Toolkit } from "verovio";
// Load local Chopin etude MEI using Vite raw import
// @ts-ignore: raw import as string
import etudeMei from "@/scores/Chopin/etudeOp10No1.xml?raw";
import etudeMei2 from "@/scores/Chopin/etudeOp10No2.xml?raw";
import type { Pages } from "./components/pages";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root element not found");
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
    <!-- <div class="hero"> -->
    <!--   <img src="${heroImg}" class="base" width="170" height="179" alt="Decorative background" /> -->
    <!--   <img src="${typescriptLogo}" class="framework" alt="TypeScript logo" /> -->
    <!--   <img src="${viteLogo}" class="vite" alt="Vite logo" /> -->
    <!-- </div> -->
    <!-- <div> -->
    <!--   <h1>Get started</h1> -->
    <!--   <p>Edit <code>src/main.ts</code> and save to test <code>HMR</code></p> -->
    <!-- </div> -->
    <!-- <button id="counter" type="button" class="counter"></button> -->
  </section>

  <div class="ticks"></div>

  <section id="next-steps">
    <div id="docs">
      <!-- <svg class="icon" role="presentation" aria-hidden="true"> -->
      <!--   <use href="/icons.svg#documentation-icon"></use> -->
      <!-- </svg> -->
      <!-- <h2>Documentation</h2> -->
      <!-- <p>Your questions, answered</p> -->
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
    </div>
    <div id="social">
        <div id="XML-notation-compare" class="notation-stage">Loading score...</div>
      </div>
      <!-- <svg class="icon" role="presentation" aria-hidden="true"> -->
      <!--   <use href="/icons.svg#social-icon"></use> -->
      <!-- </svg> -->
      <!-- <h2>Connect with us</h2> -->
      <!-- <p>Join the Vite community</p> -->
      <!-- <ul> -->
      <!--   <li> -->
      <!--     <a href="https://github.com/vitejs/vite" target="_blank" rel="noreferrer"> -->
      <!--       <svg class="button-icon" role="presentation" aria-hidden="true"> -->
      <!--         <use href="/icons.svg#github-icon"></use> -->
      <!--       </svg> -->
      <!--       GitHub -->
      <!--     </a> -->
      <!--   </li> -->
      <!--   <li> -->
      <!--     <a href="https://chat.vite.dev/" target="_blank" rel="noreferrer"> -->
      <!--       <svg class="button-icon" role="presentation" aria-hidden="true"> -->
      <!--         <use href="/icons.svg#discord-icon"></use> -->
      <!--       </svg> -->
      <!--       Discord -->
      <!--     </a> -->
      <!--   </li> -->
      <!--   <li> -->
      <!--     <a href="https://x.com/vite_js" target="_blank" rel="noreferrer"> -->
      <!--       <svg class="button-icon" role="presentation" aria-hidden="true"> -->
      <!--         <use href="/icons.svg#x-icon"></use> -->
      <!--       </svg> -->
      <!--       X.com -->
      <!--     </a> -->
      <!--   </li> -->
      <!--   <li> -->
      <!--     <a href="https://bsky.app/profile/vite.dev" target="_blank" rel="noreferrer"> -->
      <!--       <svg class="button-icon" role="presentation" aria-hidden="true"> -->
      <!--         <use href="/icons.svg#bluesky-icon"></use> -->
      <!--       </svg> -->
      <!--       Bluesky -->
      <!--     </a> -->
      <!--   </li> -->
      <!-- </ul> -->
    </div>
  </section>

  <div class="ticks"></div>
  <section id="spacer"></section>
`;
const root = document.documentElement;
const notationContainer =
  document.querySelector<HTMLDivElement>("#XML-notation");
const notationContainer2 = document.querySelector<HTMLDivElement>(
  "#XML-notation-compare",
);
const notationPanel = document.querySelector<HTMLDivElement>(".notation-panel");
const notationScaleInput =
  document.querySelector<HTMLInputElement>("#notation-scale");
const notationScaleValue = document.querySelector<HTMLOutputElement>(
  "#notation-scale-value",
);
const themeToggleButton =
  document.querySelector<HTMLButtonElement>("#theme-toggle");
const themeToggleLabel = document.querySelector<HTMLSpanElement>(
  "#theme-toggle-label",
);

// Pagination element handle (typed via global HTMLElementTagNameMap augmentation)
let paginationEl: Pages | null = null;
let paginationEl2: Pages | null = null;

if (
  !notationContainer ||
  !notationContainer2 ||
  !notationScaleInput ||
  !notationScaleValue ||
  !themeToggleButton ||
  !themeToggleLabel ||
  !notationPanel
) {
  throw new Error("App controls not found");
}

// create and insert pagination component into notation panel
paginationEl = document.createElement("page-pagination");
paginationEl2 = document.createElement("page-pagination");
//INFO: This is needed to be able to re-render the SVG
paginationEl.notationContainer = notationContainer;
paginationEl2.notationContainer = notationContainer2;

//TODO: Make the notation as a single component and pass all controls/paginaiton etc to it as a param
notationPanel.appendChild(paginationEl);

type Theme = "light" | "dark";

let meiXML: string | null = null;
let meiXML2: string | null = null;
let toolkit: Toolkit | null = null;
let toolkit2: Toolkit | null = null;
const themeStorageKey = "theme-preference";
const themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

const getSystemTheme = (): Theme =>
  themeMediaQuery.matches ? "dark" : "light";

const syncThemeToggle = (theme: Theme) => {
  const isDark = theme === "dark";
  themeToggleButton.setAttribute("aria-pressed", String(isDark));
  themeToggleLabel.textContent = `Theme: ${isDark ? "Dark" : "Light"}`;
};

const applyTheme = (theme: Theme, persist = false) => {
  root.dataset.theme = theme;
  syncThemeToggle(theme);

  if (persist) {
    window.localStorage.setItem(themeStorageKey, theme);
  }
};

const savedTheme = window.localStorage.getItem(themeStorageKey);

if (savedTheme === "light" || savedTheme === "dark") {
  applyTheme(savedTheme);
} else {
  syncThemeToggle(getSystemTheme());
}

themeToggleButton.addEventListener("click", () => {
  const currentTheme =
    (root.dataset.theme as Theme | undefined) ?? getSystemTheme();
  const nextTheme: Theme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(nextTheme, true);
});

themeMediaQuery.addEventListener("change", (event) => {
  if (window.localStorage.getItem(themeStorageKey)) {
    return;
  }

  syncThemeToggle(event.matches ? "dark" : "light");
});

const updateScaleLabel = (scale: number) => {
  if (scale > 1000) return console.error("Maximum is 1000");
  if (scale < 1) return console.error("Minimum is 1");
  notationScaleValue.value = `${scale}%`;
  notationScaleValue.textContent = `${scale}%`;
};

const renderNotation = (
  meiXMLFile: string | null,
  paginationEl: Pages,
  toolkit: Toolkit | null,
  notationContainer: HTMLDivElement,
) => {
  if (!toolkit || !meiXMLFile) {
    return console.warn("No toolkit or xmlfile");
  }

  // const scale = Number(notationScaleInput.value)
  const options: VerovioOptions = {
    adjustPageHeight: true,
    breaks: "auto",
    // scale,
    //INFO: xmlIdSeed is remapped later by setNotationSVGIDToIndexBase
    // xmlIdSeed: 1,
    useFacsimile: true,
    systemMaxPerPage: 24,
  };

  const totalPages = getTotalPageCount(toolkit);
  if (paginationEl) paginationEl.total = totalPages;

  // load the MEI into the toolkit and set options so we can render a single page
  toolkit.loadData(meiXMLFile);
  toolkit.setOptions(options);
  paginationEl.toolkit = toolkit;
  const svg = toolkit.renderToSVG(paginationEl ? paginationEl.page : 1);

  notationContainer.innerHTML = svg;
  console.trace(svg, "svg");
  setNotationSVGIDToIndexBase(notationContainer);
};

// updateScaleLabel(Number(notationScaleInput.value))
// notationScaleInput.addEventListener('input', () => {
//   const scale = Number(notationScaleInput.value)
//   updateScaleLabel(scale)
//   renderNotation(meiXML, paginationEl, toolkit)
// })
//
// const resizeObserver = new ResizeObserver(() => {
//   renderNotation(meiXML, paginationEl, toolkit)
// })
//
// resizeObserver.observe(notationContainer)

verovio.module.onRuntimeInitialized = async () => {
  toolkit = new verovio.toolkit();
  toolkit2 = new verovio.toolkit();
  try {
    // Use bundled MEI content instead of fetching remotely
    meiXML = etudeMei as string;
    meiXML2 = etudeMei2 as string;

    renderNotation(meiXML, paginationEl, toolkit, notationContainer);
    renderNotation(meiXML2, paginationEl, toolkit2, notationContainer2);

    const xmlDiff = diffXML(meiXML, meiXML2);
    applyDiffHighlights(notationContainer, notationContainer2, xmlDiff);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    notationContainer.textContent = `Unable to load score: ${message}`;
  }
};
