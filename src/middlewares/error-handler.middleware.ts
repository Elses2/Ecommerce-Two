import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";

// errorHandler: captura errores lanzados y devuelve una respuesta de error;
// debe montarse siempre al final (firma de 4 argumentos)
export function errorHandler(
  err: Error & { status?: number },
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error(err);
  res.status(err.status ?? 500).json({ error: err.message ?? "Internal server error" });
}
