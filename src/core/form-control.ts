/**
 * Base class for form-associated custom elements.
 *
 * Holds only the standard form-control API surface. It implements no
 * lifecycle callbacks, so subclasses never need to call super for them.
 * Value, reset, restore and validation are each subclass's own job.
 *
 * Effective disabled state (own attribute or a disabled fieldset ancestor)
 * is available as `this.matches(":disabled")`.
 *
 * @attr name - Name used when submitting the form.
 * @attr label - Visible label. Use the `label` slot for rich content. External `<label>` elements aren't supported.
 * @attr disabled - Disables the control. A disabled fieldset ancestor also disables it.
 */
export class FormControl extends HTMLElement {
  static formAssociated: boolean = true;

  protected readonly internals: ElementInternals;

  constructor() {
    super();
    this.internals = this.attachInternals();
  }

  get form(): HTMLFormElement | null {
    return this.internals.form;
  }

  /** Reflects the `name` attribute. */
  get name(): string {
    return this.getAttribute("name") ?? "";
  }

  set name(value: string) {
    this.setAttribute("name", value);
  }

  /** Reflects the `label` attribute. */
  get label(): string {
    return this.getAttribute("label") ?? "";
  }

  set label(value: string) {
    this.setAttribute("label", value);
  }

  /** Reflects the `disabled` attribute. Use `matches(":disabled")` for the effective state. */
  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }

  set disabled(value: boolean) {
    this.toggleAttribute("disabled", Boolean(value));
  }

  get validity(): ValidityState {
    return this.internals.validity;
  }

  get validationMessage(): string {
    return this.internals.validationMessage;
  }

  get willValidate(): boolean {
    return this.internals.willValidate;
  }

  get labels(): NodeList {
    return this.internals.labels;
  }

  checkValidity(): boolean {
    return this.internals.checkValidity();
  }

  reportValidity(): boolean {
    return this.internals.reportValidity();
  }
}
