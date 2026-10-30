import { FormControl } from "./form-control.js";
import { submitImplicitly } from "./implicit-submit.js";

const template = document.createElement("template");
template.innerHTML = `
  <style>
    :host { display: inline-block; }
    input { box-sizing: border-box; width: 100%; font: inherit; }
  </style>
  <input part="input" />
`;

export class CeInput extends FormControl {
  static observedAttributes = ["value", "placeholder"];

  #initialized = false;

  /** @type {HTMLInputElement | null} */
  #input = null;

  /**
   * Value set by the user or the `value` property. While null, the `value`
   * attribute (default value) applies, as with native `<input>`.
   * @type {string | null}
   */
  #dirtyValue = null;

  get defaultValue() {
    return this.getAttribute("value") ?? "";
  }

  set defaultValue(value) {
    this.setAttribute("value", value);
  }

  get value() {
    return this.#dirtyValue ?? this.defaultValue;
  }

  set value(value) {
    // Unlike other properties this doesn't reflect: the `value` attribute is
    // the default value, matching native `<input>`.
    this.#dirtyValue = String(value);
    this.#updateValue();
  }

  get placeholder() {
    return this.getAttribute("placeholder") ?? "";
  }

  set placeholder(value) {
    this.setAttribute("placeholder", value);
  }

  connectedCallback() {
    if (!this.#initialized) {
      this.#setup();
      this.#initialized = true;
    }

    this.#updateValue();
    this.#updatePlaceholder();
    this.#updateDisabled();
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.#initialized) {
      return;
    }

    if (oldValue === newValue) {
      return;
    }

    if (name === "value") {
      this.#updateValue();
      return;
    }

    if (name === "placeholder") {
      this.#updatePlaceholder();
      return;
    }
  }

  formDisabledCallback() {
    this.#updateDisabled();
  }

  formResetCallback() {
    this.#dirtyValue = null;
    this.#updateValue();
  }

  /** @param {string | File | FormData | null} state */
  formStateRestoreCallback(state) {
    if (typeof state !== "string") {
      return;
    }

    this.#dirtyValue = state;
    this.#updateValue();
  }

  #setup() {
    const root = this.attachShadow({ mode: "open", delegatesFocus: true });
    root.append(template.content.cloneNode(true));

    const input = root.querySelector("input");

    if (!input) {
      return;
    }

    input.addEventListener("input", this.#onInput);
    input.addEventListener("change", this.#onChange);
    input.addEventListener("keydown", this.#onKeydown);

    this.#input = input;
  }

  #onInput = () => {
    if (!this.#input) {
      return;
    }

    this.#dirtyValue = this.#input.value;
    this.#updateValue();
  };

  // `input` is composed and reaches the host on its own; `change` isn't.
  #onChange = () => {
    this.dispatchEvent(new Event("change", { bubbles: true }));
  };

  /** @param {KeyboardEvent} event */
  #onKeydown = (event) => {
    if (event.key !== "Enter") {
      return;
    }

    // Enter confirms IME composition rather than submitting.
    if (event.isComposing) {
      return;
    }

    if (event.defaultPrevented) {
      return;
    }

    submitImplicitly(this);
  };

  #updateValue() {
    const value = this.value;

    this.internals.setFormValue(value);

    if (!this.#input) {
      return;
    }

    // Skip no-op writes so the caret doesn't jump while typing.
    if (this.#input.value === value) {
      return;
    }

    this.#input.value = value;
  }

  #updatePlaceholder() {
    if (!this.#input) {
      return;
    }

    this.#input.placeholder = this.placeholder;
  }

  #updateDisabled() {
    if (!this.#input) {
      return;
    }

    this.#input.disabled = this.matches(":disabled");
  }
}

if (!customElements.get("ce-input")) {
  customElements.define("ce-input", CeInput);
}
