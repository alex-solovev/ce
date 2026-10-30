import { FormControl } from "../core/form-control.js";

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
export declare class CeInput extends FormControl {
  static observedAttributes: string[];
  /** Reflects the `value` attribute. */
  defaultValue: string;
  /** Current value. Doesn't reflect. */
  value: string;
  /** Reflects the `placeholder` attribute. */
  placeholder: string;
  /** Reflects the `with-clear` attribute. */
  withClear: boolean;
  connectedCallback(): void;
  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void;
  formDisabledCallback(): void;
  formResetCallback(): void;
  formStateRestoreCallback(state: string | File | FormData | null): void;
}

declare global {
  interface HTMLElementTagNameMap {
    "ce-input": CeInput;
  }
}
