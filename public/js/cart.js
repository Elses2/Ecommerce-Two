// Cart client (spec §5/§6.4/§24): every click on a [data-cart-action] element
// hits its /api/cart/* endpoint with the JWT (window.Auth.fetch) and re-renders
// the cart from the JSON response — no page reloads. The counter and the cart
// page hydrate on load with GET /api/cart (the server no longer knows the user
// without the token). The server always answers with { items, total, count }
// and prices computed from the DB.
(function () {
  "use strict";

  const ENDPOINTS = {
    add: (id) => ({ method: "POST", url: `/api/cart/add/${id}` }),
    increase: (id) => ({ method: "PATCH", url: `/api/cart/increase/${id}` }),
    decrease: (id) => ({ method: "PATCH", url: `/api/cart/decrease/${id}` }),
    remove: (id) => ({ method: "DELETE", url: `/api/cart/remove/${id}` }),
    clear: () => ({ method: "DELETE", url: "/api/cart/clear" }),
  };

  const format = (n) => Number(n).toLocaleString("es-AR");

  function rowFromTemplate(item) {
    const template = document.getElementById("cart-item-template");
    if (!template) return null;
    const node = template.content.firstElementChild.cloneNode(true);
    node.setAttribute("data-cart-item", String(item.productId));
    node
      .querySelectorAll("[data-product-id]")
      .forEach((el) =>
        el.setAttribute("data-product-id", String(item.productId)),
      );
    const img = node.querySelector("img");
    if (img) {
      img.src = item.imageUrl;
      img.alt = item.name;
    }
    const name = node.querySelector("h3");
    if (name) name.textContent = item.name;
    const remove = node.querySelector('[data-cart-action="remove"]');
    if (remove)
      remove.setAttribute("aria-label", `Quitar ${item.name} del carrito`);
    const quantity = node.querySelector("[data-quantity]");
    if (quantity) quantity.textContent = item.quantity;
    const subtotal = node.querySelector("[data-subtotal]");
    if (subtotal) subtotal.textContent = format(item.subtotal);
    return node;
  }

  // Full re-render from the server response. Also hydrates the header badges on
  // every page (data-cart-count), and the cart page skeleton.
  function renderCart(cart) {
    const list = document.getElementById("cart-items");
    if (list) {
      list.innerHTML = "";
      cart.items.forEach((item) => {
        const row = rowFromTemplate(item);
        if (row) list.appendChild(row);
      });
    }

    const isEmpty = cart.items.length === 0;
    document.querySelectorAll("[data-cart-empty]").forEach((el) => {
      el.classList.toggle("hidden", !isEmpty);
    });
    if (list) list.classList.toggle("hidden", isEmpty);
    document.querySelectorAll("[data-cart-summary]").forEach((el) => {
      el.classList.toggle("hidden", isEmpty);
    });
    document.querySelectorAll("[data-cart-total]").forEach((el) => {
      el.textContent = format(cart.total);
    });
    document.querySelectorAll("[data-cart-count]").forEach((el) => {
      el.textContent = cart.count;
    });
  }

  async function loadCart() {
    if (!window.Auth || !window.Auth.getToken()) return;
    try {
      const res = await window.Auth.fetch("/api/cart");
      if (!res.ok) return;
      renderCart(await res.json());
    } catch (err) {
      console.error("Cart load failed:", err);
    }
  }

  document.addEventListener("click", async (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-cart-action]");
    if (!button) return;

    const { cartAction, productId } = button.dataset;
    const buildEndpoint = ENDPOINTS[cartAction];
    if (!buildEndpoint) return;

    // Sin token no hay carrito: mandar a login preservando el destino.
    if (!window.Auth || !window.Auth.getToken()) {
      const next = encodeURIComponent(window.location.pathname);
      window.location.href = `/login?next=${next}`;
      return;
    }

    const { method, url } = buildEndpoint(productId);
    try {
      const res = await window.Auth.fetch(url, { method });
      if (!res.ok) {
        console.error(`Cart request failed: ${res.status} ${res.statusText}`);
        return;
      }
      renderCart(await res.json());
    } catch (err) {
      console.error("Cart request failed:", err);
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadCart);
  } else {
    loadCart();
  }
})();
