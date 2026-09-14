/*
 * Register form client-side validation (spec §6.3, checklist Paso 9).
 * Vanilla JS, no framework, no AJAX — it only intercepts the submit and
 * shows per-field specific error messages (never a generic alert).
 *
 * Structure: the §6.3 rules live in PURE functions exported as
 * window.RegisterValidation (also module.exports for DOM-less testing);
 * the DOM wiring at the bottom just consumes them.
 *
 * Field contract (spec §4.5): inputs have exact name/id `name`, `lastname`,
 * `email`, `password`; each field's error slot is
 * `<p data-error-for="{id}" class="hidden">` rendered by atoms/input.ejs.
 */
(function () {
  "use strict";

  // Exact special-character set from §6.3: ! @ # $ % ^ & * ( ) , . ? " : { } | < >
  var SPECIAL_CHARS = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', ',', '.', '?', '"', ':', '{', '}', '|', '<', '>'];

  // §6.3 forbidden substrings (checked case-insensitive): "password", "1234",
  // "qwerty", the site name, the entered name and the entered email.
  var SITE_NAME = "miecommerce";

  function isNonEmptyAfterTrim(value) {
    return value.trim().length > 0;
  }

  // "Sin espacios al principio/final en ningún campo" (§6.3): the raw value
  // must already be trimmed — reject (do NOT trim-and-accept).
  function hasLeadingOrTrailingSpaces(value) {
    return value !== value.trim();
  }

  function isValidEmail(value) {
    // Standard-enough regex: something@something.tld, no inner spaces.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function hasAtLeastOneLetter(value) {
    return /[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ]/.test(value);
  }

  function hasAtLeastOneNumber(value) {
    return /[0-9]/.test(value);
  }

  function hasAtLeastOneSpecialChar(value) {
    return Array.from(value).some(function (ch) {
      return SPECIAL_CHARS.indexOf(ch) !== -1;
    });
  }

  function containsForbiddenString(value, formValues) {
    var lower = value.toLowerCase();
    var forbidden = [
      { needle: "password", message: 'La contraseña no debe contener la palabra "password".' },
      { needle: "1234", message: 'La contraseña no debe contener la secuencia "1234".' },
      { needle: "qwerty", message: 'La contraseña no debe contener la palabra "qwerty".' },
      { needle: SITE_NAME, message: "La contraseña no debe contener el nombre del sitio." },
    ];
    var enteredName = (formValues.name || "").trim().toLowerCase();
    if (enteredName.length > 0 && lower.indexOf(enteredName) !== -1) {
      return "La contraseña no debe contener tu nombre.";
    }
    var enteredEmail = (formValues.email || "").trim().toLowerCase();
    if (enteredEmail.length > 0 && lower.indexOf(enteredEmail) !== -1) {
      return "La contraseña no debe contener tu email.";
    }
    for (var i = 0; i < forbidden.length; i++) {
      if (lower.indexOf(forbidden[i].needle) !== -1) {
        return forbidden[i].message;
      }
    }
    return "";
  }

  /**
   * Validates ONE field against §6.3. Pure: no DOM.
   * @param {string} fieldName "name" | "lastname" | "email" | "password"
   * @param {string} rawValue the field's current (untrimmed) value
   * @param {{name?: string, lastname?: string, email?: string, password?: string}} formValues
   * @returns {string} specific error message, or "" when the field is valid
   */
  function validateField(fieldName, rawValue, formValues) {
    var value = typeof rawValue === "string" ? rawValue : "";

    // §6.3 order: emptiness (nor only spaces) first — a whitespace-only field
    // is visually empty for the user — then leading/trailing spaces.
    if (!isNonEmptyAfterTrim(value)) {
      if (fieldName === "name") return "El nombre es obligatorio.";
      if (fieldName === "lastname") return "El apellido es obligatorio.";
      if (fieldName === "email") return "El email es obligatorio.";
      return "La contraseña es obligatoria.";
    }
    if (hasLeadingOrTrailingSpaces(value)) {
      return "Este campo no debe tener espacios al principio ni al final.";
    }

    if (fieldName === "email" && !isValidEmail(value)) {
      return "Ingresá un email válido (ej: nombre@dominio.com).";
    }

    if (fieldName === "password") {
      if (value.length < 8) {
        return "La contraseña debe tener al menos 8 caracteres.";
      }
      if (!hasAtLeastOneLetter(value)) {
        return "La contraseña debe incluir al menos una letra.";
      }
      if (!hasAtLeastOneNumber(value)) {
        return "La contraseña debe incluir al menos un número.";
      }
      if (!hasAtLeastOneSpecialChar(value)) {
        return 'La contraseña debe incluir al menos un carácter especial (! @ # $ % ^ & * ( ) , . ? " : { } | < >).';
      }
      var forbiddenMessage = containsForbiddenString(value, formValues);
      if (forbiddenMessage) return forbiddenMessage;
      if (value === (formValues.email || "").trim()) {
        return "La contraseña no debe ser igual a tu email.";
      }
    }

    return "";
  }

  /**
   * Validates the whole form. Pure: no DOM.
   * @param {{name?: string, lastname?: string, email?: string, password?: string}} values
   * @returns {{name: string, lastname: string, email: string, password: string}}
   *   map of field → specific error message ("" when valid).
   */
  function validateForm(values) {
    var fields = ["name", "lastname", "email", "password"];
    var errors = {};
    fields.forEach(function (field) {
      errors[field] = validateField(field, values[field] || "", values);
    });
    return errors;
  }

  var RegisterValidation = {
    SPECIAL_CHARS: SPECIAL_CHARS,
    isValidEmail: isValidEmail,
    validateField: validateField,
    validateForm: validateForm,
  };

  // Browser global (script is included as a plain <script defer>, no modules).
  if (typeof window !== "undefined") {
    window.RegisterValidation = RegisterValidation;
  }
  // DOM-less testing harness (node require of this file).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = RegisterValidation;
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
    var form = document.getElementById("register-form");
    if (!form) return;

    var fields = ["name", "lastname", "email", "password"];

    // Good UX (spec is silent): clear a field's error as the user fixes it.
    fields.forEach(function (field) {
      var input = form.querySelector('[name="' + field + '"]');
      if (!input) return;
      input.addEventListener("input", function () {
        clearError(form, field);
      });
    });

    form.addEventListener("submit", function (e) {
      var values = {};
      fields.forEach(function (field) {
        values[field] = getFieldValue(form, field);
      });

      var errors = window.RegisterValidation.validateForm(values);
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
      }
      // All valid → normal POST (§6.3: "un POST normal con redirect");
      // the auth endpoint itself lands in a later paso.
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
