// Helper puro de normalización de ids (spec §6.9): parsea el segmento :id y
// devuelve number | null — null significa "no numérico / no entero / <= 0" y
// el controller debe responder 400. Solo valida FORMATO: que el id exista en
// DB se resuelve después en el controller (§6.9), consultando el repository.
//
// Vive en utils/ porque es un helper puro reutilizable: lo usan los
// controllers de páginas (spec §6.8 getProductDetail) y la factory de ruta
// `validateId` (`middlewares/route/validate-id.middleware.ts`), que se encadena
// en las rutas de la API.
export function normalizeId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}
