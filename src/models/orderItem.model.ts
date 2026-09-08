// Modelo de la tabla order_items (spec §1.1); unit_price queda congelado al momento de la compra
export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
}
