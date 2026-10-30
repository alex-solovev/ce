/**
 * Base class for form-associated custom elements.
 *
 * Holds only the standard form-control API surface. It implements no
 * lifecycle callbacks, so subclasses never need to call super for them.
 * Value, reset, restore and validation are each subclass's own job.
 *
 * Effective disabled state (own attribute or a disabled fieldset ancestor)
 * is available as `this.matches(":disabled")`.
 */
export class FormControl extends HTMLElement {
  static formAssociated = true;

  /** @protected @readonly */
  internals;

  constructor() {
    super();
    this.internals = this.attachInternals();
  }

  get form() {
    return this.internals.form;
  }

  get name() {
    return this.getAttribute("name") ?? "";
  }

  set name(value) {
    this.setAttribute("name", value);
  }

  get label() {
    return this.getAttribute("label") ?? "";
  }

  set label(value) {
    this.setAttribute("label", value);
  }

  get disabled() {
    return this.hasAttribute("disabled");
  }

  set disabled(value) {
    this.toggleAttribute("disabled", Boolean(value));
  }

  get validity() {
    return this.internals.validity;
  }

  get validationMessage() {
    return this.internals.validationMessage;
  }

  get willValidate() {
    return this.internals.willValidate;
  }

  get labels() {
    return this.internals.labels;
  }

  checkValidity() {
    return this.internals.checkValidity();
  }

  reportValidity() {
    return this.internals.reportValidity();
  }
}
