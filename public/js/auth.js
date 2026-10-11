/*
 * Auth client (spec §23.4, enmienda cookie httpOnly): con la cookie
 * `auth_token` el navegador envía la sesión sola; este archivo ya no guarda
 * ni adjunta el token. Solo queda:
 *  - `Auth.fetch`: fetch con `credentials: "same-origin"`; un 401 manda al
 *    login (sesión vencida a mitad de navegación).
 *  - Wiring de formularios `[data-auth-form]` (login/registro): fetch JSON
 *    normal (un 401 de credenciales inválidas se muestra en `data-auth-error`,
 *    no redirige) y en éxito redirige a `next` validado.
 *  - Logout `[data-auth-logout]`: `POST /api/auth/logout` y a `/`.
 *  - Limpieza única: el token de la versión anterior (localStorage) no debe
 *    quedar legible.
 *
 * Cargado en layout.ejs ANTES de cart.js para que `window.Auth` exista.
 */
(function () {
  "use strict";

  var TOKEN_KEY = "auth_token";

  function safeNext(value) {
    // Evita open redirect: solo rutas internas ("/...") y nunca "//host".
    if (typeof value !== "string") return "/";
    if (!value.startsWith("/") || value.startsWith("//")) return "/";
    return value;
  }

  function currentNext() {
    var params = new URLSearchParams(window.location.search);
    return safeNext(params.get("next"));
  }

  var Auth = {
    /**
     * fetch con la cookie de sesión. Solo un 401 redirige al login: es la
     * sesión vencida a mitad de navegación, no un error del endpoint.
     */
    fetch: async function (url, options) {
      var opts = options || {};
      var res = await window.fetch(
        url,
        Object.assign({}, opts, { credentials: "same-origin" }),
      );
      if (res.status === 401) {
        window.location.href =
          "/login?next=" + encodeURIComponent(window.location.pathname);
      }
      return res;
    },
  };

  window.Auth = Auth;

  function showErrors(form, messages) {
    var box = form.querySelector("[data-auth-error]");
    if (!box) return;
    if (!messages || messages.length === 0) {
      box.textContent = "";
      box.classList.add("hidden");
      return;
    }
    box.innerHTML = "";
    messages.forEach(function (message) {
      var p = document.createElement("p");
      p.textContent = message;
      box.appendChild(p);
    });
    box.classList.remove("hidden");
  }

  function formValues(form) {
    var values = {};
    var inputs = form.querySelectorAll("input[name]");
    for (var i = 0; i < inputs.length; i++) {
      values[inputs[i].name] = inputs[i].value;
    }
    return values;
  }

  function setBusy(form, busy) {
    var button = form.querySelector('button[type="submit"]');
    if (!button) return;
    button.disabled = busy;
    if (busy) {
      button.dataset.label = button.textContent;
      button.textContent = "Procesando…";
    } else if (button.dataset.label) {
      button.textContent = button.dataset.label;
    }
  }

  function initAuthForm(form) {
    form.addEventListener("submit", async function (event) {
      // register-validation.js corre antes (se carga antes en el documento) y
      // marca defaultPrevented cuando hay errores de cliente.
      if (event.defaultPrevented) return;
      event.preventDefault();

      var endpoint = form.getAttribute("data-auth-endpoint");
      if (!endpoint) return;

      showErrors(form, []);
      setBusy(form, true);
      try {
        var res = await window.fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(formValues(form)),
        });
        var data = await res.json().catch(function () {
          return {};
        });
        if (res.ok) {
          // La cookie ya está puesta (httpOnly); solo hay que navegar al next.
          window.location.href = currentNext();
          return;
        }
        showErrors(
          form,
          data.errors || [data.error || "No se pudo completar la operación"],
        );
      } catch (_err) {
        showErrors(form, ["No se pudo conectar con el servidor"]);
      } finally {
        setBusy(form, false);
      }
    });
  }

  function initLogout() {
    var els = document.querySelectorAll("[data-auth-logout]");
    for (var i = 0; i < els.length; i++) {
      els[i].addEventListener("click", function (event) {
        event.preventDefault();
        // La cookie la borra el servidor (C9); el navegador no puede.
        window
          .fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
          .then(function () {
            window.location.href = "/";
          })
          .catch(function () {
            // Sin red: igual se navega (la cookie quedará y expirará sola).
            window.location.href = "/";
          });
      });
    }
  }

  function cleanupLegacyToken() {
    // Limpieza única: el token de la versión anterior (localStorage) no debe
    // seguir legible por XSS. Falla silenciosamente sin storage.
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch (_err) {
      /* sin storage */
    }
  }

  function init() {
    var forms = document.querySelectorAll("[data-auth-form]");
    for (var i = 0; i < forms.length; i++) initAuthForm(forms[i]);
    initLogout();
    cleanupLegacyToken();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})();