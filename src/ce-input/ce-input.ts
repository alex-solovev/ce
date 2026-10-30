import "../ce-icon/ce-icon.ts";
import { FormControl } from "../core/form-control.ts";
import {
  labelMarkup,
  labelStyles,
  setupFieldLabel,
  updateFieldLabel,
} from "../core/field-label.ts";
import { submitImplicitly } from "../core/implicit-submit.ts";

const template = document.createElement("template");
template.innerHTML = `
  <style>
    :host { display: inline-block; }

    ${labelStyles}

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
  ${labelMarkup}
  <div part="base">
    <slot name="start"></slot>
    <input part="input" />
    <button part="clear-button" type="button" tabindex="-1" aria-label="Clear" hidden>
      <slot name="clear-icon"><ce-icon name="xmark"></ce-icon></slot>
    </button>
    <slot name="end"></slot>
  </div>
`;

/**
 * Single-line text input.
 *
 * @attr value - Default value, restored on form reset.
 * @attr placeholder - Placeholder text.
 * @attr with-clear - Shows a button that clears the value.
 * @slot label - Rich label content. Overrides the `label` attribute.
 * @slot start - Decorative content before the input, such as an unlabeled `<ce-icon>`. Not for interactive content.
 * @slot end - Decorative content after the input. Not for interactive content.
 * @slot clear-icon - Replaces the clear button's default icon.
 * @csspart label - The label.
 * @csspart base - The box around the input and slots.
 * @csspart input - The inner native input.
 * @csspart clear-button - The clear button.
 * @fires input - On every edit.
 * @fires change - When an edit is committed.
 */
export class CeInput extends FormControl {
  static observedAttributes: string[] = ["value", "placeholder", "with-clear", "label"];

  #initialized = false;

  #input: HTMLInputElement | null = null;

  #clearButton: HTMLButtonElement | null = null;

  /**
   * Value set by the user or the `value` property. While null, the `value`
   * attribute (default value) applies, as with native `<input>`.
   */
  #dirtyValue: string | null = null;

  /** Reflects the `value` attribute. */
  get defaultValue(): string {
    return this.getAttribute("value") ?? "";
  }

  set defaultValue(value: string) {
    this.setAttribute("value", value);
  }

  /** Current value. Doesn't reflect. */
  get value(): string {
    return this.#dirtyValue ?? this.defaultValue;
  }

  set value(value: string) {
    // Unlike other properties this doesn't reflect: the `value` attribute is
    // the default value, matching native `<input>`.
    this.#dirtyValue = String(value);
    this.#updateValue();
  }

  /** Reflects the `placeholder` attribute. */
  get placeholder(): string {
    return this.getAttribute("placeholder") ?? "";
  }

  set placeholder(value: string) {
    this.setAttribute("placeholder", value);
  }

  /** Reflects the `with-clear` attribute. */
  get withClear(): boolean {
    return this.hasAttribute("with-clear");
  }

  set withClear(value: boolean) {
    this.toggleAttribute("with-clear", Boolean(value));
  }

  connectedCallback(): void {
    if (!this.#initialized) {
      this.#setup();
      this.#initialized = true;
    }

    this.#updateValue();
    this.#updatePlaceholder();
    this.#updateDisabled();
    this.#updateLabel();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
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

    if (name === "label") {
      this.#updateLabel();
      return;
    }
  }

  formDisabledCallback(): void {
    this.#updateDisabled();
  }

  formResetCallback(): void {
    this.#dirtyValue = null;
    this.#updateValue();
  }

  formStateRestoreCallback(state: string | File | FormData | null): void {
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

    setupFieldLabel(this, root, input);
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

  #onKeydown = (event: KeyboardEvent) => {
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

  #onClearMousedown = (event: MouseEvent) => {
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

  #updateLabel() {
    if (!this.shadowRoot || !this.#input) {
      return;
    }

    updateFieldLabel(this, this.shadowRoot, this.#input);
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

declare global {
  interface HTMLElementTagNameMap {
    "ce-input": CeInput;
  }
}

if (!customElements.get("ce-input")) {
  customElements.define("ce-input", CeInput);
}
