/*
 * Auth client (spec §23): token JWT en localStorage, `Auth.fetch` que adjunta
 * `Authorization: Bearer`, wiring de los formularios de login/registro por
 * `fetch` JSON y render del header (invitado vs usuario).
 *
 * Sin cookies: el token vive en localStorage y se manda a mano. El servidor
 * sigue siendo la autoridad; esto es solo el cliente.
 *
 * Cargado en layout.ejs ANTES de cart.js para que `window.Auth` exista cuando
 * el carrito lo use.
 */
(function () {
  "use strict";

  var TOKEN_KEY = "auth_token";
  var USER_KEY = "auth_user";

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_err) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (_err) {
      /* modo incógnito o storage bloqueado: degradar sin romper */
    }
  }

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
    getToken: function () {
      return readStorage(TOKEN_KEY);
    },
    setToken: function (token) {
      writeStorage(TOKEN_KEY, token);
    },
    getUser: function () {
      var raw = readStorage(USER_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (_err) {
        return null;
      }
    },
    setUser: function (user) {
      writeStorage(USER_KEY, user ? JSON.stringify(user) : null);
    },
    clear: function () {
      writeStorage(TOKEN_KEY, null);
      writeStorage(USER_KEY, null);
    },

    /**
     * fetch con el token adjunto. Un 401 con token enviado limpia la sesión y
     * redirige a /login (nunca para llamadas sin token, p. ej. el login mismo).
     */
    fetch: async function (url, options) {
      var opts = options || {};
      var token = Auth.getToken();
      var headers = Object.assign({}, opts.headers || {});
      if (token) headers.Authorization = "Bearer " + token;
      var res = await window.fetch(
        url,
        Object.assign({}, opts, { headers: headers }),
      );
      if (res.status === 401 && token) {
        Auth.clear();
        window.location.href =
          "/login?next=" + encodeURIComponent(window.location.pathname);
      }
      return res;
    },

    renderHeader: function () {
      var user = Auth.getUser();
      var nameEls = document.querySelectorAll("[data-auth-name]");
      var logoutEls = document.querySelectorAll("[data-auth-logout]");
      var profileEls = document.querySelectorAll("[data-auth-profile]");
      var label = user && user.name ? user.name : "Invitado";
      for (var i = 0; i < nameEls.length; i++) nameEls[i].textContent = label;
      for (var j = 0; j < logoutEls.length; j++)
        logoutEls[j].classList.toggle("hidden", !user);
      for (var k = 0; k < profileEls.length; k++) {
        profileEls[k].setAttribute("href", user ? "#" : "/login");
      }
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
          body: JSON.stringify(formValues(form)),
        });
        var data = await res.json().catch(function () {
          return {};
        });
        if (res.ok && data.token) {
          Auth.setToken(data.token);
          Auth.setUser(data.user || null);
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
        Auth.clear();
        window.location.href = "/";
      });
    }
  }

  async function hydrateUser() {
    if (!Auth.getToken()) {
      Auth.setUser(null);
      return;
    }
    try {
      var res = await Auth.fetch("/api/auth/me");
      if (res.ok) {
        var data = await res.json();
        Auth.setUser(data.user || null);
      }
    } catch (_err) {
      /* sin red: se conserva el usuario cacheado */
    }
  }

  function init() {
    var forms = document.querySelectorAll("[data-auth-form]");
    for (var i = 0; i < forms.length; i++) initAuthForm(forms[i]);
    initLogout();
    Auth.renderHeader();
    hydrateUser().then(Auth.renderHeader);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})();
