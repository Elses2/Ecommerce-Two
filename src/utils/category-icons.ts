// Spec §6.6b: category → Lucide icon mapping. Purely visual concern — the
// categories table has no icon column and the service keeps returning only
// { id, name, description }. Imported from the controller/render seam and
// exposed to EJS templates via app.locals (spec: "se importa desde el
// controller o desde organisms/categories-nav.ejs").
import * as lucide from "lucide-static";

/**
 * Mapeo estático de nombres de categorías a identificadores de iconos de Lucide.
 *
 * // Static mapping verbatim from spec §6.6b. Keys are exact category names;
 * // lookups normalize case/accents, so DB rows like "Periféricos" miss on
 * // purpose and take the fallback.
 */
export const CATEGORY_ICONS: Record<string, string> = {
  "Electrónica": "cpu",
  "Alimentos": "utensils",
  "Bebidas": "coffee",
  "Indumentaria": "shirt",
  "Juegos": "gamepad-2",
  "Automotor": "car",
  "Hogar": "home",
  // Spec §6.6b says "gift-box", but lucide-static@1.42.0 ships no such icon
  // (verified: icons/gift-box.svg does not exist). Maintainer override: use
  // "package" for "Otros" (icons/package.svg exists, verified).
  "Otros": "package",
};

/**
 * Icono genérico por defecto asignado a cualquier categoría no registrada en el mapeo (spec §6.6b).
 */
export const FALLBACK_CATEGORY_ICON = "tag";

/**
 * Normaliza una cadena de texto eliminando espacios, convirtiendo a minúsculas y removiendo tildes o caracteres diacríticos.
 *
 * @param {string} name - Nombre original de la categoría.
 * @returns {string} Nombre normalizado en minúsculas y sin acentos.
 */
function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Diccionario privado con las claves de categorías previamente normalizadas para búsquedas rápidas.
 */
const NORMALIZED_CATEGORY_ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_ICONS).map(([name, icon]) => [normalizeName(name), icon]),
);

/**
 * Obtiene el nombre en kebab-case del icono de Lucide correspondiente a una categoría.
 * Insensible a mayúsculas y acentos; utiliza el icono `tag` como fallback si la categoría no existe.
 *
 * @param {string} name - Nombre de la categoría a consultar.
 * @returns {string} Nombre del icono en Lucide (ej: "cpu", "tag").
 */
export function getCategoryIcon(name: string): string {
  return NORMALIZED_CATEGORY_ICONS[normalizeName(name)] ?? FALLBACK_CATEGORY_ICON;
}

// lucide-static exports raw SVG strings under PascalCase names (`Cpu`, `Tag`).
const lucideIcons = lucide as unknown as Record<string, unknown>;

/**
 * Convierte el nombre de un icono en formato kebab-case a PascalCase y recupera su marcado SVG de `lucide-static`.
 *
 * @param {string} iconName - Nombre del icono en kebab-case (ej. "gamepad-2").
 * @returns {string} Cadena de texto con la etiqueta `<svg>` completa.
 */
function lucideSvg(iconName: string): string {
  const pascalName = iconName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  const svg = lucideIcons[pascalName];
  return typeof svg === "string" ? svg.trim() : lucide.Tag.trim();
}

/**
 * Obtiene la etiqueta SVG lista para embeber en plantillas EJS para el icono de una categoría.
 *
 * @param {string} name - Nombre de la categoría.
 * @returns {string} Código SVG del icono renderizable directamente mediante `<%- %>`.
 */
export function getCategoryIconSvg(name: string): string {
  return lucideSvg(getCategoryIcon(name));
}