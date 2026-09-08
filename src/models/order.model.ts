// Modelo de la tabla orders (spec §1.1); sin checkout real en este alcance
export interface Order {
  id: number;
  user_id: number;
  created_at: string | null;
}
