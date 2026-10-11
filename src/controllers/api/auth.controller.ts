import type { Request, Response } from "express";
import { authService, type AuthResult } from "../../services/auth.service.js";
import { userRepository } from "../../repositories/user.repository.js";
import {
  clearAuthCookie,
  setAuthCookie,
} from "../../utils/auth-cookie.js";
import type { LoginDto, RegisterDto } from "../../dtos/auth.dto.js";

/**
 * @fileoverview Controller de la API de autenticación (spec §23.2, enmienda
 * cookie httpOnly): handlers finos que llaman a `authService` y traducen el
 * resultado a HTTP. El token ya NO viaja en el body (C2): `login`/`register`
 * lo ponen en la cookie `auth_token` y responden `{ user }`; `logout` borra
 * la cookie (C9). No contiene lógica de negocio ni SQL (regla del §0).
 */

/**
 * Lee un campo del body como string (el body puede venir de `express.json`).
 *
 * @param {unknown} body - Body parseado por Express.
 * @param {string} field - Nombre del campo.
 * @returns {string} El valor del campo, o `""` si no es string.
 */
function bodyString(body: unknown, field: string): string {
  if (typeof body !== "object" || body === null) return "";
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string" ? value : "";
}

/**
 * Traduce el fallo de un `AuthResult` a la respuesta HTTP (spec §23.2):
 * validación → 400, email tomado → 409, credenciales → 401.
 *
 * @param {Response} res - Respuesta Express.
 * @param {AuthResult} result - Resultado fallido del service.
 * @returns {void}
 */
function sendAuthFailure(
  res: Response,
  result: Extract<AuthResult, { ok: false }>,
): void {
  const status =
    result.reason === "validation"
      ? 400
      : result.reason === "email_taken"
        ? 409
        : 401;
  res.status(status).json({ errors: result.errors });
}

export const authController = {
  /**
   * Registra un usuario, pone la cookie de sesión y devuelve `{ user }` (C2).
   *
   * @swagger
   * /api/auth/register:
   *   post:
   *     summary: Registrar usuario
   *     description: Crea un usuario con rol customer y devuelve su perfil; el JWT viaja en la cookie `auth_token` (httpOnly).
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/RegisterRequest'
   *     responses:
   *       201:
   *         description: Usuario creado; devuelve el perfil y setea la cookie `auth_token`.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 user:
   *                   $ref: '#/components/schemas/User'
   *       400:
   *         description: Datos inválidos (lista de errores en español).
   *       409:
   *         description: El email ya está registrado.
   *
   * @param {Request} req - Petición Express (lee `req.body`).
   * @param {Response} res - Respuesta Express (setea la cookie).
   * @returns {Promise<void>} Resuelve al enviar la respuesta.
   */
  async register(req: Request, res: Response): Promise<void> {
    const dto: RegisterDto = {
      name: bodyString(req.body, "name"),
      lastname: bodyString(req.body, "lastname"),
      email: bodyString(req.body, "email"),
      password: bodyString(req.body, "password"),
    };
    const result = await authService.register(dto);
    if (!result.ok) {
      sendAuthFailure(res, result);
      return;
    }
    setAuthCookie(res, result.token);
    res.status(201).json({ user: result.user });
  },

  /**
   * Valida credenciales, pone la cookie de sesión y devuelve `{ user }` (C2).
   *
   * @swagger
   * /api/auth/login:
   *   post:
   *     summary: Iniciar sesión
   *     description: Valida email/contraseña y setea la cookie de sesión `auth_token` (httpOnly).
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/LoginRequest'
   *     responses:
   *       200:
   *         description: Credenciales válidas; devuelve el perfil y setea la cookie.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 user:
   *                   $ref: '#/components/schemas/User'
   *       401:
   *         description: Credenciales inválidas.
   *
   * @param {Request} req - Petición Express (lee `req.body`).
   * @param {Response} res - Respuesta Express (setea la cookie).
   * @returns {Promise<void>} Resuelve al enviar la respuesta.
   */
  async login(req: Request, res: Response): Promise<void> {
    const dto: LoginDto = {
      email: bodyString(req.body, "email"),
      password: bodyString(req.body, "password"),
    };
    const result = await authService.login(dto.email, dto.password);
    if (!result.ok) {
      sendAuthFailure(res, result);
      return;
    }
    setAuthCookie(res, result.token);
    res.json({ user: result.user });
  },

  /**
   * Cierra la sesión borrando la cookie (C9). No necesita `authenticate`:
   * borrar una cookie ajena o inexistente es inocuo. Sin revocación en el
   * servidor: el JWT sigue valiendo hasta su `exp` si alguien lo copió.
   *
   * @swagger
   * /api/auth/logout:
   *   post:
   *     summary: Cerrar sesión
   *     description: Borra la cookie `auth_token`.
   *     tags: [Auth]
   *     responses:
   *       204:
   *         description: Cookie borrada.
   *
   * @param {Request} _req - Petición Express (no usada).
   * @param {Response} res - Respuesta Express (borra la cookie).
   * @returns {void}
   */
  logout(_req: Request, res: Response): void {
    clearAuthCookie(res);
    res.status(204).end();
  },

  /**
   * Devuelve el usuario del token (spec §23.2). Requiere `authenticate`.
   *
   * @swagger
   * /api/auth/me:
   *   get:
   *     summary: Usuario actual
   *     description: Devuelve el usuario autenticado a partir del JWT.
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Usuario autenticado.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 user:
   *                   $ref: '#/components/schemas/User'
   *       401:
   *         description: Token requerido, inválido o usuario inexistente.
   *
   * @param {Request} req - Petición Express (requiere `req.user`).
   * @param {Response} res - Respuesta Express.
   * @returns {void}
   */
  me(req: Request, res: Response): void {
    const id = req.user?.id;
    if (id === undefined) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }
    const user = userRepository.findById(id);
    if (!user) {
      // Token válido de un usuario borrado: ya no hay identidad real.
      res.status(401).json({ error: "Usuario no encontrado" });
      return;
    }
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  },
};
