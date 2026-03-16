import type { toolkit as Toolkit } from 'verovio'

export const getTotalPageCount = (toolkit: Toolkit): number => {
  return toolkit.getPageCount();
}

