import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";
import type { AssetType, ResolvedAssetSize } from "@vite-pwa/assets-generator/config";

function assetName(type: AssetType, size: ResolvedAssetSize): string {
  switch (type) {
    case "transparent":
      return `pwa-${size.width}x${size.height}.png`;
    case "maskable":
      return `pwa-maskable-${size.width}x${size.height}.png`;
    case "apple":
      return "apple-touch-icon.png";
  }
}

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { sizes: [192, 512] },
    assetName,
  },
  images: ["public/favicon.svg"],
});
