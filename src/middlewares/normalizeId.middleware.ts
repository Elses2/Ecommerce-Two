import type { NextFunction, Request, Response } from "express";

// normalizeId: valida que el :id del request sea numérico; rechaza con 400 lo contrario.
// Cuando se monta globalmente (antes de los routers), Express aún no pobló
// req.params: como fallback se interpreta el segmento de id de rutas API
// tipo /api/recurso/:id para poder rechazar valores no numéricos igualmente.
const ID_PATH_PATTERN = /^\/api\/[a-z]+\/([^/]+)$/;

export function normalizeId(req: Request, res: Response, next: NextFunction): void {
  // @types/express 5 tipa params/path como string | string[]
  const rawId = req.params.id;
  const routeId = Array.isArray(rawId) ? rawId[0] : rawId;
  const reqPath = Array.isArray(req.path) ? req.path[0] : req.path;
  const pathId = ID_PATH_PATTERN.exec(reqPath)?.[1];
  const id = routeId ?? pathId;
  if (id !== undefined && !/^\d+$/.test(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  next();
}
