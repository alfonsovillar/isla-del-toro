// Web estática; un directorio por idioma (/ca/, /es/, /en/, /de/).
import { defineConfig } from "astro/config";

// SITE_BASE: subcarpeta donde se publica (GitHub Pages de proyecto: "/<repo>"). En local y con dominio propio, "/".
const base = process.env.SITE_BASE || "/";

export default defineConfig({
  base,
  site: process.env.SITE_URL || undefined,
  i18n: { defaultLocale: "es", locales: ["ca", "es", "en", "de"], routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false } },
  build: { format: "directory" },
});
