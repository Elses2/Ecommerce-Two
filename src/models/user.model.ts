// Modelo de la tabla users (spec §1.1); sin lógica de auth en este alcance
export interface User {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  created_at: string | null;
}
