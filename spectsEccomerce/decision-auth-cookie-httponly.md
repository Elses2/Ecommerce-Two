# Decisión — JWT en cookie `httpOnly` (en vez de `localStorage`)

> **Documento histórico** de una decisión de arquitectura (issue #105).
> No es fuente de implementación: la descripción vigente del sistema está en
> `SPEC.md` (§23, §24 y §22). Cierra la pregunta abierta de
> `contexto-usuarios-auth.md` sobre el transporte del token.

## Contexto

Desde el PR de autenticación (#94, spec §23) el JWT se guardaba en
`localStorage` y viajaba en `Authorization: Bearer`. La decisión original se
justificaba como «sin cookies»: el servidor no conocía al usuario en una
navegación normal, no había CSRF que mitigar y las páginas protegidas eran
cascarones que su JS hidrataba con `fetch` más token.

Con el tiempo aparecieron los costos de esa decisión:

1. **XSS leía el token**: cualquier script inyectado copiaba el JWT
   (`localStorage.getItem("auth_token")`).
2. **Cada archivo JS debía «acordarse» de adjuntar el header**, y el header
   solo se hidrataba después de cargar `auth.js` (rebotes a `/login` por
   hidratación tardía, `Auth.fetch` especial en `cart.js`, `checkout.js`).
3. **Las páginas protegidas no podían resolverse en el servidor**: sin cookie
   no había credencial ambiente, así que `/cart` y `/checkout` eran cascarones.

## La decisión (2026-10-11, issue #105)

Migrar el transporte del JWT a una cookie **`httpOnly`**:

- **Sigue siendo stateless**: el servidor no guarda nada; la cookie es solo el
  medio por el que viaja el JWT y el navegador la envía solo. No se reintroduce
  ni `express-session` ni sesión server-side.
- **C1** — Cookie `auth_token`: `httpOnly`, `SameSite=Lax`, `Path=/`, `Secure`
  según `COOKIE_SECURE` (misma lógica que `CSP_UPGRADE_INSECURE`: no depende de
  `NODE_ENV`, se activa solo detrás de HTTPS). Sin prefijo `__Host-` (exige
  `Secure` y hoy se sirve por HTTP).
- **C2** — `login`/`register` ponen la cookie y responden `{ user }` (sin
  `token`); ningún JS toca el token.
- **C3** — `Authorization: Bearer` sigue aceptado (prioridad al header si
  viene; si no, la cookie): sirve para curl, tests y un futuro móvil.
- **C4** — CSRF sin librería: `SameSite=Lax` + verificación de `Origin` /
  `Sec-Fetch-Site` en toda mutación (middleware global `csrfOrigin`); los `GET`
  no tienen efectos secundarios.
- **C5** — `COOKIE_SECURE` (boolean, default `false`), solo detrás de HTTPS.
- **C6** — Claim `name` en el JWT: el header pinta el nombre sin consultar la
  base (la cookie no es legible por JS).
- **C7** — El contador del carrito sigue client-side: si Redis cae, las páginas
  siguen funcionando.
- **C8** — Vida fija de 2 h (`JWT_EXPIRES_IN`); el `maxAge` de la cookie se
  deriva del `exp` del token.
- **C9** — Logout = `POST /api/auth/logout` (borra la cookie); sin revocación
  server-side (limitación conocida).

## Qué cambió en la práctica

| Antes (localStorage) | Después (cookie httpOnly) |
|---|---|
| Token legible por JS (XSS) | Token invisible para JS |
| Cada JS adjunta el header | `fetch` con `credentials: "same-origin"` manda la cookie sola |
| Páginas protegidas = cascarones + rebote por hidratación | 302 **del servidor** (`requirePageAuth`) a `/login?next=…` |
| Header hidratado por `auth.js` | Header renderizado por el servidor (`attachUser` → `res.locals.user`) |
| CSRF «cerrado por diseño» (sin cookies) | CSRF relevante de nuevo: `SameSite=Lax` + `csrfOrigin` |
| `auth.js` ~100 líneas | `auth.js` mínimo (fetch + formularios + logout + limpieza) |

## Efectos sobre los usuarios

- Los tokens viejos (en `localStorage`) quedan inertes: `auth.js` los borra una
  sola vez al cargar; los usuarios inician sesión una vez tras desplegar.
- Si `COOKIE_SECURE=true` y se entra por `http://IP:PUERTO`, el navegador
  descarta la cookie y el login «no mantiene» la sesión (documentado en
  `.env.example`).

## Alternativas descartadas

- **Prefijo `__Host-`**: exige `Secure` siempre y hoy se sirve por HTTP.
- **Tokens CSRF por sesión**: innecesario con `SameSite=Lax` + verificación de
  origen (C4); se revisaría si el front dejara de ser servido por el mismo
  origen (ver `TRUSTED_ORIGINS` como posible lista opcional detrás de un proxy).
- **Refresh tokens en Redis**: revocación real, pero agrega estado y complejidad;
  queda como fase opcional futura si el robo de tokens se vuelve un problema
  real (la vida es de 2 h).

## Cierre de la pregunta de `contexto-usuarios-auth.md`

El documento abría si convenía seguir «sin cookies». Esta decisión la cierra:
sí hay cookie, pero solo como transporte del JWT; el servidor sigue sin estado.
Quedan vigentes de aquel documento: CSRF (ahora cubierto con C4), y la
observación de que el header deja de depender de JS.