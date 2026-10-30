import "../ce-icon/ce-icon.js";
import { FormControl } from "../core/form-control.js";
import { submitImplicitly } from "../core/implicit-submit.js";

const template = document.createElement("template");
template.innerHTML = `
  <style>
    :host { display: inline-block; }

    [part="base"] {
      display: flex;
      align-items: center;
      gap: 0.25em;
      box-sizing: border-box;
      width: 100%;
      padding: 0.125em 0.25em;
      border: 1px solid #767676;
      border-radius: 2px;
      background: Field;
      color: FieldText;
      cursor: text;
    }

    [part="base"]:focus-within { outline: 2px solid AccentColor; outline-offset: 1px; }

    :host(:disabled) [part="base"] { opacity: 0.5; cursor: default; }

    input {
      flex: 1;
      min-width: 0;
      padding: 0;
      border: 0;
      outline: 0;
      background: transparent;
      color: inherit;
      font: inherit;
    }

    [part="clear-button"] {
      display: flex;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }

    [part="clear-button"][hidden] { display: none; }
  </style>
  <div part="base">
    <slot name="start"></slot>
    <input part="input" />
    <button part="clear-button" type="button" tabindex="-1" aria-label="Clear" hidden>
      <slot name="clear-icon"><ce-icon name="xmark"></ce-icon></slot>
    </button>
    <slot name="end"></slot>
  </div>
`;

export class CeInput extends FormControl {
  static observedAttributes = ["value", "placeholder", "with-clear"];

  #initialized = false;

  /** @type {HTMLInputElement | null} */
  #input = null;

  /** @type {HTMLButtonElement | null} */
  #clearButton = null;

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

  get withClear() {
    return this.hasAttribute("with-clear");
  }

  set withClear(value) {
    this.toggleAttribute("with-clear", Boolean(value));
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

    if (name === "with-clear") {
      this.#updateClearButton();
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
    const clearButton = root.querySelector("button");

    if (!input || !clearButton) {
      return;
    }

    input.addEventListener("input", this.#onInput);
    input.addEventListener("change", this.#onChange);
    input.addEventListener("keydown", this.#onKeydown);

    clearButton.addEventListener("mousedown", this.#onClearMousedown);
    clearButton.addEventListener("click", this.#onClearClick);

    this.#input = input;
    this.#clearButton = clearButton;
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

  /** @param {MouseEvent} event */
  #onClearMousedown = (event) => {
    // Keep focus in the input instead of moving it to the button.
    event.preventDefault();
  };

  #onClearClick = () => {
    this.#dirtyValue = "";
    this.#updateValue();

    this.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
    this.dispatchEvent(new Event("change", { bubbles: true }));

    this.#input?.focus();
  };

  #updateValue() {
    const value = this.value;

    this.internals.setFormValue(value);
    this.#updateClearButton();

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
    this.#updateClearButton();

    if (!this.#input) {
      return;
    }

    this.#input.disabled = this.matches(":disabled");
  }

  #updateClearButton() {
    if (!this.#clearButton) {
      return;
    }

    const hasValue = this.value !== "";
    const disabled = this.matches(":disabled");

    this.#clearButton.hidden = !this.withClear || !hasValue || disabled;
  }
}

if (!customElements.get("ce-input")) {
  customElements.define("ce-input", CeInput);
}
