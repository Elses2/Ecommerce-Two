// Checkout client (spec §19/§24): carga el token de idempotencia y el resumen
// por GET /api/checkout (con el JWT) y envía el formulario por fetch a
// POST /api/checkout. Sin cookies, el servidor no puede renderizar el carrito
// del usuario: la página es un cascarón que este script hidrata.
//
// La validación cliente de §19 (checkout-validation.js) corre antes y marca
// `defaultPrevented` cuando hay errores; acá se respeta.
(function () {
  "use strict";

  const format = (n) => Number(n).toLocaleString("es-AR");

  function setErrors(messages) {
    const box = document.querySelector("[data-checkout-errors]");
    const list = document.querySelector("[data-checkout-errors-list]");
    if (!box || !list) return;
    list.innerHTML = "";
    if (!messages || messages.length === 0) {
      box.classList.add("hidden");
      return;
    }
    messages.forEach((message) => {
      const li = document.createElement("li");
      li.textContent = message;
      list.appendChild(li);
    });
    box.classList.remove("hidden");
  }

  function renderSummary(cart) {
    const list = document.querySelector("[data-checkout-summary]");
    const total = document.querySelector("[data-checkout-total]");
    if (list) {
      list.innerHTML = "";
      cart.items.forEach((item) => {
        const li = document.createElement("li");
        li.className = "flex items-baseline justify-between gap-4 text-sm";
        const left = document.createElement("span");
        left.className = "text-ink";
        left.textContent = item.name;
        const quantity = document.createElement("span");
        quantity.className = "text-muted";
        quantity.textContent = ` × ${item.quantity}`;
        left.appendChild(quantity);
        const subtotal = document.createElement("span");
        subtotal.className = "font-medium text-ink";
        subtotal.textContent = format(item.subtotal);
        li.appendChild(left);
        li.appendChild(subtotal);
        list.appendChild(li);
      });
    }
    if (total) total.textContent = format(cart.total);
  }

  async function loadCheckout(form) {
    if (!window.Auth || !window.Auth.getToken()) {
      window.location.href = "/login?next=" + encodeURIComponent("/checkout");
      return;
    }
    try {
      const res = await window.Auth.fetch("/api/checkout");
      if (!res.ok) return;
      const data = await res.json();
      const tokenInput = form.querySelector('input[name="checkoutToken"]');
      if (tokenInput) tokenInput.value = data.checkoutToken || "";
      if (!data.cart || data.cart.items.length === 0) {
        window.location.href = "/cart";
        return;
      }
      renderSummary(data.cart);
    } catch (err) {
      console.error("Checkout load failed:", err);
    }
  }

  function onSubmit(event) {
    const form = event.currentTarget;
    // checkout-validation.js (cargado antes) previene el submit si hay errores.
    if (event.defaultPrevented) return;
    event.preventDefault();

    const submit = form.querySelector("[data-checkout-submit]");
    if (submit) {
      submit.disabled = true;
      submit.dataset.label = submit.textContent;
      submit.textContent = "Procesando…";
    }
    setErrors([]);

    const values = {};
    form.querySelectorAll("input[name], select[name]").forEach((el) => {
      values[el.name] = el.value;
    });

    window.Auth.fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.status === 201 && data.confirmationToken) {
          window.location.href = `/checkout/confirmation/${data.confirmationToken}`;
          return;
        }
        setErrors(
          data.errors || [data.error || "No se pudo completar la compra"],
        );
        if (submit) {
          submit.disabled = false;
          if (submit.dataset.label) submit.textContent = submit.dataset.label;
        }
      })
      .catch(() => {
        setErrors(["No se pudo conectar con el servidor"]);
        if (submit) {
          submit.disabled = false;
          if (submit.dataset.label) submit.textContent = submit.dataset.label;
        }
      });
  }

  function init() {
    const form = document.querySelector("[data-checkout-form]");
    if (!form) return;
    form.addEventListener("submit", onSubmit);
    loadCheckout(form);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
