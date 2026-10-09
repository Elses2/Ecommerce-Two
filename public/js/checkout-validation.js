/*
 * Checkout form client-side validation (spec §19).
 * Vanilla JS, no framework, no AJAX — it only intercepts the submit and
 * shows per-field specific error messages (never a generic alert). On a
 * VALID submit it disables the button ("Procesando…") to prevent
 * double-click / double-order (D6).
 *
 * Structure mirrors register-validation.js (§6.3): the rules live in PURE
 * functions exported as window.CheckoutValidation (also module.exports for
 * DOM-less testing); the DOM wiring at the bottom just consumes them.
 *
 * Field contract (spec §19 / checkout.ejs): the 8 text fields render via
 * atoms/input.ejs with error slots `<p data-error-for="{name}">`; the
 * paymentMethod select and the hidden checkoutToken are inline. The server
 * stays the authority (checkout.service.validateCheckoutInput) — this is
 * UX, not security.
 */
(function () {
  "use strict";

  // Exact select values from checkout.ejs (spec §19, D9 — preference only).
  var PAYMENT_METHODS = ["transfer", "cash_on_delivery", "card"];

  function isNonEmptyAfterTrim(value) {
    return value.trim().length > 0;
  }

  function isValidEmail(value) {
    // Same pragmatic pattern as the service: something@something.tld.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  // Phone digits ignoring spaces, +, - and parentheses (service rule).
  function phoneDigits(value) {
    return value.replace(/[\s+\-()]/g, "");
  }

  function isValidPhone(value) {
    return /^\d{7,15}$/.test(phoneDigits(value));
  }

  /**
   * Validates ONE field against §19. Pure: no DOM.
   * @param {string} fieldName "firstName" | "lastName" | "email" | "phone" | "address" | "city" | "postalCode" | "country" | "paymentMethod"
   * @param {string} rawValue the field's current (untrimmed) value
   * @returns {string} specific error message, or "" when the field is valid
   */
  function validateField(fieldName, rawValue) {
    var value = typeof rawValue === "string" ? rawValue : "";

    // Required-first (same order as the service): emptiness after trim.
    if (!isNonEmptyAfterTrim(value)) {
      switch (fieldName) {
        case "firstName": return "El nombre es obligatorio.";
        case "lastName": return "El apellido es obligatorio.";
        case "email": return "El email es obligatorio.";
        case "phone": return "El teléfono es obligatorio.";
        case "address": return "La dirección es obligatoria.";
        case "city": return "La ciudad es obligatoria.";
        case "postalCode": return "El código postal es obligatorio.";
        case "country": return "El país es obligatorio.";
        case "paymentMethod": return "Seleccioná un método de pago.";
      }
      return "";
    }

    var trimmed = value.trim();

    if (fieldName === "email") {
      if (trimmed.length > 254) return "El email no puede superar los 254 caracteres.";
      if (!isValidEmail(trimmed)) return "Ingresá un email válido (ej: nombre@dominio.com).";
    }
    if (fieldName === "phone" && !isValidPhone(value)) {
      return "El teléfono debe tener entre 7 y 15 dígitos.";
    }
    if (fieldName === "firstName" && trimmed.length > 100) {
      return "El nombre no puede superar los 100 caracteres.";
    }
    if (fieldName === "lastName" && trimmed.length > 100) {
      return "El apellido no puede superar los 100 caracteres.";
    }
    if ((fieldName === "address" || fieldName === "city" || fieldName === "country") && trimmed.length > 200) {
      return "Este campo no puede superar los 200 caracteres.";
    }
    if (fieldName === "postalCode" && trimmed.length > 20) {
      return "El código postal no puede superar los 20 caracteres.";
    }
    if (fieldName === "paymentMethod" && PAYMENT_METHODS.indexOf(value) === -1) {
      return "El método de pago no es válido.";
    }

    return "";
  }

  /**
   * Validates the whole form. Pure: no DOM.
   * @param {Object} values map of field name → raw value
   * @returns {Object} map of field → specific error message ("" when valid)
   */
  function validateForm(values) {
    var fields = ["firstName", "lastName", "email", "phone", "address", "city", "postalCode", "country", "paymentMethod"];
    var errors = {};
    fields.forEach(function (field) {
      errors[field] = validateField(field, values[field] || "");
    });
    return errors;
  }

  var CheckoutValidation = {
    PAYMENT_METHODS: PAYMENT_METHODS,
    isValidEmail: isValidEmail,
    isValidPhone: isValidPhone,
    validateField: validateField,
    validateForm: validateForm,
  };

  // Browser global (script is included as a plain <script defer>, no modules).
  if (typeof window !== "undefined") {
    window.CheckoutValidation = CheckoutValidation;
  }
  // DOM-less testing harness (node require of this file).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = CheckoutValidation;
  }

  // --- DOM wiring (browser only) -------------------------------------------
  function getFieldValue(form, field) {
    var input = form.querySelector('[name="' + field + '"]');
    return input ? input.value : "";
  }

  function showError(form, field, message) {
    var slot = form.querySelector('[data-error-for="' + field + '"]');
    var input = form.querySelector('[name="' + field + '"]');
    if (slot) {
      slot.textContent = message;
      slot.classList.remove("hidden");
    }
    if (input) {
      input.setAttribute("aria-invalid", "true");
      input.classList.add("border-alert");
    }
  }

  function clearError(form, field) {
    var slot = form.querySelector('[data-error-for="' + field + '"]');
    var input = form.querySelector('[name="' + field + '"]');
    if (slot) {
      slot.textContent = "";
      slot.classList.add("hidden");
    }
    if (input) {
      input.removeAttribute("aria-invalid");
      input.classList.remove("border-alert");
    }
  }

  function init() {
    var form = document.querySelector("[data-checkout-form]");
    if (!form) return;

    var fields = ["firstName", "lastName", "email", "phone", "address", "city", "postalCode", "country", "paymentMethod"];

    // Good UX (same as register): clear a field's error as the user fixes it.
    // The select fires "change", the text inputs "input".
    fields.forEach(function (field) {
      var input = form.querySelector('[name="' + field + '"]');
      if (!input) return;
      var eventName = input.tagName === "SELECT" ? "change" : "input";
      input.addEventListener(eventName, function () {
        clearError(form, field);
      });
    });

    form.addEventListener("submit", function (e) {
      var values = {};
      fields.forEach(function (field) {
        values[field] = getFieldValue(form, field);
      });

      var errors = window.CheckoutValidation.validateForm(values);
      var firstInvalid = null;
      fields.forEach(function (field) {
        if (errors[field]) {
          showError(form, field, errors[field]);
          if (!firstInvalid) firstInvalid = field;
        } else {
          clearError(form, field);
        }
      });

      if (firstInvalid) {
        e.preventDefault();
        var firstInput = form.querySelector('[name="' + firstInvalid + '"]');
        if (firstInput) firstInput.focus();
        return;
      }

      // All valid → normal POST (§19), but block double-click / double-order
      // (D6): the submit button disables and the request proceeds once.
      var button = form.querySelector("[data-checkout-submit]");
      if (button) {
        button.disabled = true;
        button.textContent = "Procesando…";
      }
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})();
