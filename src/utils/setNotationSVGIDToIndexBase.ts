export const setNotationSVGIDToIndexBase = (notationContainer: HTMLDivElement): string[] | null => {
  console.log(notationContainer)
  let ids: string[] | null = null
  notationContainer.childNodes.forEach((child, index) => {
    if (child.ELEMENT_NODE !== 1) return
    const childEl = child as HTMLElement
    if (childEl.tagName !== 'svg') return;
    childEl.id = `notation-${index.toString()}`;
  })
  return ids;
}
