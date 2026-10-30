import { FormControl } from "../core/form-control.js";

/**
 * Single-line text input.
 *
 * @attr value - Default value, restored on form reset.
 * @attr placeholder - Placeholder text.
 * @csspart input - The inner native input.
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
