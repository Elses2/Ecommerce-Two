// Cart AJAX (spec §6.4): every click on a [data-cart-action] element hits its
// /api/cart/* endpoint and rewrites only the affected numbers from the JSON
// response — no page reloads. The server always answers with the updated
// cart: { items, total, count } (prices computed from the DB server-side).

const ENDPOINTS = {
  add: (id) => ({ method: "POST", url: `/api/cart/add/${id}` }),
  increase: (id) => ({ method: "PATCH", url: `/api/cart/increase/${id}` }),
  decrease: (id) => ({ method: "PATCH", url: `/api/cart/decrease/${id}` }),
  remove: (id) => ({ method: "DELETE", url: `/api/cart/remove/${id}` }),
  clear: () => ({ method: "DELETE", url: "/api/cart/clear" }),
};

const format = (n) => n.toLocaleString("es-AR");

// Re-renders the cart from the server response:
// - per row [data-cart-item="<id>"]: quantity + subtotal (missing → remove node)
// - [data-cart-total] and every header badge [data-cart-count]
// - empty state: [data-cart-empty] vs items list + summary visibility
function updateCartUI(cart) {
  document.querySelectorAll("[data-cart-item]").forEach((row) => {
    const productId = Number(row.dataset.cartItem);
    const item = cart.items.find((i) => i.productId === productId);
    if (!item) {
      row.remove();
      return;
    }
    const quantity = row.querySelector("[data-quantity]");
    const subtotal = row.querySelector("[data-subtotal]");
    if (quantity) quantity.textContent = item.quantity;
    if (subtotal) subtotal.textContent = format(item.subtotal);
  });

  document.querySelectorAll("[data-cart-total]").forEach((el) => {
    el.textContent = format(cart.total);
  });

  // Header counter: both desktop and mobile headers render a badge.
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    el.textContent = cart.count;
  });

  const isEmpty = cart.items.length === 0;
  document.querySelectorAll("[data-cart-empty]").forEach((el) => {
    el.classList.toggle("hidden", !isEmpty);
  });
  const itemsList = document.getElementById("cart-items");
  if (itemsList) itemsList.classList.toggle("hidden", isEmpty);
  document.querySelectorAll("[data-cart-summary]").forEach((el) => {
    el.classList.toggle("hidden", isEmpty);
  });
}

document.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("[data-cart-action]");
  if (!button) return;

  const { cartAction, productId } = button.dataset;
  const buildEndpoint = ENDPOINTS[cartAction];
  if (!buildEndpoint) return;

  const { method, url } = buildEndpoint(productId);
  try {
    const res = await fetch(url, { method });
    if (!res.ok) {
      console.error(`Cart request failed: ${res.status} ${res.statusText}`);
      return;
    }
    updateCartUI(await res.json());
  } catch (err) {
    console.error("Cart request failed:", err);
  }
});
