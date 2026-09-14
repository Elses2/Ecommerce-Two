import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";

// errorHandler (spec §6.2): captura errores lanzados y responde según el
// tipo de request; debe montarse siempre al final (firma de 4 argumentos),
// después del 404 catch-all de app.ts.
// - Logueo server-side con prefijo "Error interno:" (snippet del spec):
//   nunca se filtra err.message ni stack a la VISTA (validación clave §6.2).
// - /api/*: JSON, no HTML (los consumidores AJAX del carrito no deben
//   recibir una página). Se conserva el contrato previo del middleware:
//   status = err.status ?? 500 y body { error: err.message ?? ... } —
//   §6.2 solo prohíbe filtrar message hacia la vista; el cuerpo JSON de
//   API queda como estaba en este paso.
// - Páginas: renderiza templates/pages/500 (árbol atómico; el snippet del
//   spec usa el path legacy "pages/500", el proyecto resuelve el árbol
//   multi-root views/templates con layout heredado).
// - Fallback anti-loop: si el propio render de la página 500 falla (vista o
//   layout), el callback de res.render lo captura y responde texto plano
//   "Internal server error" — sin pasar por next(err), evitando el bucle
//   infinito de error handler.
export function errorHandler(
  err: Error & { status?: number },
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error("Error interno:", err);
  const status = err.status ?? 500;

  // API: JSON puro (contrato previo intacto para los fetch AJAX)
  if (req.path.startsWith("/api")) {
    res.status(status).json({ error: err.message ?? "Internal server error" });
    return;
  }

  // Página: render con callback; un fallo del render NO debe volver a
  // disparar el errorHandler (bucle), por eso el fallback en texto plano.
  res.status(status).render(
    "templates/pages/500",
    { title: "Error interno" },
    (renderErr: Error | null, html?: string) => {
      if (renderErr) {
        console.error("Error interno: falló el render de la página 500:", renderErr);
        res.status(500).send("Internal server error");
        return;
      }
      res.status(status).send(html ?? "");
    },
  );
}
