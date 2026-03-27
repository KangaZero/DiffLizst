import type { Pages } from "@/components/pages";
import type { DiffSettings } from "@/components/diffSettings";

declare global {
  interface HTMLElementTagNameMap {
    "page-pagination": Pages;
    "diff-settings": DiffSettings;
  }
}

export {};
