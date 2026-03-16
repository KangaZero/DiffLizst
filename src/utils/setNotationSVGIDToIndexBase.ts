/**
 * Remap SVG element IDs inside a notation container to stable index-based IDs.
 *
 * Verovio generates XML IDs based on its xmlIdSeed which can vary; that makes
 * targeting rendered pages with CSS or deterministic selectors unreliable. This
 * function replaces each top-level SVG's id with a predictable `notation-N`
 * identifier (where N is the page index) so styles and scripts can consistently
 * reference the rendered pages.
 *
 * @param notationContainer - Container element holding rendered SVG notation pages
 */
export const setNotationSVGIDToIndexBase = (notationContainer: HTMLDivElement): void => {
  notationContainer.childNodes.forEach((child, index) => {
    if (child.ELEMENT_NODE !== 1) return
    const childEl = child as HTMLElement
    if (childEl.tagName !== 'svg') return
    childEl.id = `notation-${index.toString()}`;
    //INFO: After this on @/style.css the approriate styling is added to this ID
  })
}
// #l19nj5e9 g.ending, #l19nj5e9 g.fing, #l19nj5e9 g.reh, #l19nj5e9 g.tempo { font - weight: bold; } #l19nj5e9 g.dir, #l19nj5e9 g.dynam, #l19nj5e9 g.mNum { font - style: italic; } #l19nj5e9 g.label { font - weight: normal; } #l19nj5e9 ellipse, #l19nj5e9 path, #l19nj5e9 polygon, #l19nj5e9 polyline, #l19nj5e9 rect { stroke: currentColor }
