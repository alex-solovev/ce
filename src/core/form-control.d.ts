/**
 * Base class for form-associated custom elements.
 *
 * @attr name - Name used when submitting the form.
 * @attr disabled - Disables the control. A disabled fieldset ancestor also disables it.
 */
export declare class FormControl extends HTMLElement {
  static formAssociated: boolean;
  protected readonly internals: ElementInternals;
  readonly form: HTMLFormElement | null;
  /** Reflects the `name` attribute. */
  name: string;
  /** Reflects the `disabled` attribute. Use `matches(":disabled")` for the effective state. */
  disabled: boolean;
  readonly validity: ValidityState;
  readonly validationMessage: string;
  readonly willValidate: boolean;
  readonly labels: NodeList;
  checkValidity(): boolean;
  reportValidity(): boolean;
}
