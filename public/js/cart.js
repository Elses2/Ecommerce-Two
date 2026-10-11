// Cart client (spec §5/§6.4/§24, enmienda cookie httpOnly): every click on a
// [data-cart-action] element hits its /api/cart/* endpoint and re-renders the
// cart from the JSON response — no page reloads. The cookie `auth_token`
// travels by itself (fetch con `credentials: "same-origin"`); "¿hay sesión?"
// se lee de `document.body.dataset.loggedIn` (data-logged-in lo pinta el
// servidor, spec §23.3). Sin sesión, "Agregar" guarda la intención en
// `sessionStorage` (pending_cart_add) y manda a login; al volver con sesión
// se ejecuta. The server always answers with { items, total, count } and
// prices computed from the DB.
(function () {
  "use strict";

  const ENDPOINTS = {
    add: (id) => ({ method: "POST", url: `/api/cart/add/${id}` }),
    increase: (id) => ({ method: "PATCH", url: `/api/cart/increase/${id}` }),
    decrease: (id) => ({ method: "PATCH", url: `/api/cart/decrease/${id}` }),
    remove: (id) => ({ method: "DELETE", url: `/api/cart/remove/${id}` }),
    clear: () => ({ method: "DELETE", url: "/api/cart/clear" }),
  };

  const PENDING_KEY = "pending_cart_add";

  const format = (n) => Number(n).toLocaleString("es-AR");

  // "¿Hay sesión?" (spec §23.3): lo decide el servidor al renderizar
  // data-logged-in en <body>; localStorage ya no guarda ningún token.
  function hasSession() {
    return document.body.dataset.loggedIn === "true";
  }

  function savePendingAdd(productId) {
    try {
      window.sessionStorage.setItem(
        PENDING_KEY,
        JSON.stringify({ productId, at: Date.now() }),
      );
    } catch (_err) {
      /* sin storage: se pierde la intención, queda el redirect */
    }
  }

  function takePendingAdd() {
    try {
      const raw = window.sessionStorage.getItem(PENDING_KEY);
      window.sessionStorage.removeItem(PENDING_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed.productId !== "undefined"
        ? parsed
        : null;
    } catch (_err) {
      return null;
    }
  }

  function redirectToLogin() {
    const next = encodeURIComponent(window.location.pathname);
    window.location.href = `/login?next=${next}`;
  }

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

  async function performAdd(productId) {
    if (!window.Auth) return;
    const res = await window.Auth.fetch(`/api/cart/add/${productId}`, {
      method: "POST",
    });
    if (res.ok) renderCart(await res.json());
  }

  async function loadCart() {
    if (!hasSession() || !window.Auth) return;
    try {
      // Acción pendiente de antes del login: se ejecuta y se borra ANTES del
      // fetch (si el fetch falla, no se reintenta en loop).
      const pending = takePendingAdd();
      if (pending) {
        await performAdd(pending.productId);
        return;
      }
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

    // Sin sesión no hay carrito (spec §24.1: la clave del Hash es el userId
    // del JWT). "Agregar" preserva la intención; el resto manda a login con
    // el destino.
    if (!hasSession()) {
      if (cartAction === "add" && productId) {
        savePendingAdd(productId);
        const next = encodeURIComponent(window.location.pathname);
        window.location.href = `/login?next=${next}&reason=cart`;
      } else {
        redirectToLogin();
      }
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