// Spec §6.6b: category → Lucide icon mapping. Purely visual concern — the
// categories table has no icon column and the service keeps returning only
// { id, name, description }. Imported from the controller/render seam and
// exposed to EJS templates via app.locals (spec: "se importa desde el
// controller o desde organisms/categories-nav.ejs").
import * as lucide from "lucide-static";

// Static mapping verbatim from spec §6.6b. Keys are exact category names;
// lookups normalize case/accents, so DB rows like "Periféricos" miss on
// purpose and take the fallback.
export const CATEGORY_ICONS: Record<string, string> = {
  "Electrónica": "cpu",
  "Alimentos": "utensils",
  "Bebidas": "coffee",
  "Indumentaria": "shirt",
  "Juegos": "gamepad-2",
  "Automotor": "car",
  "Hogar": "home",
  // Spec §6.6b says "gift-box", but lucide-static@1.42.0 ships no such icon
  // (verified: icons/gift-box.svg does not exist, icons/gift.svg does) —
  // resolved to the closest real icon instead of inventing a file name.
  "Otros": "gift",
};

// Generic icon for any category name not present in the mapping (spec §6.6b).
export const FALLBACK_CATEGORY_ICON = "tag";

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const NORMALIZED_CATEGORY_ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_ICONS).map(([name, icon]) => [normalizeName(name), icon]),
);

// Category name → kebab-case Lucide icon name, case/accent-insensitive,
// with the generic `tag` fallback for unmapped names.
export function getCategoryIcon(name: string): string {
  return NORMALIZED_CATEGORY_ICONS[normalizeName(name)] ?? FALLBACK_CATEGORY_ICON;
}

// lucide-static exports raw SVG strings under PascalCase names (`Cpu`, `Tag`).
const lucideIcons = lucide as unknown as Record<string, unknown>;

function lucideSvg(iconName: string): string {
  const pascalName = iconName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  const svg = lucideIcons[pascalName];
  return typeof svg === "string" ? svg.trim() : lucide.Tag.trim();
}

// Category name → ready-to-embed Lucide SVG (render with <%- %> in EJS).
export function getCategoryIconSvg(name: string): string {
  return lucideSvg(getCategoryIcon(name));
}
