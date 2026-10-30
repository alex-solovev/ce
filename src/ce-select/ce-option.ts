import "../ce-icon/ce-icon.ts";
import { defineElement, requireElement, setState, slottedText } from "../core/dom.ts";

const template = document.createElement("template");
template.innerHTML = `
  <style>
    :host {
      display: flex;
      align-items: center;
      gap: 0.5em;
      padding: 0.375em 0.5em;
      cursor: default;
      user-select: none;
    }

    :host(:state(highlighted)) { background: Highlight; color: HighlightText; }
    :host(:state(filtered-out)) { display: none; }
    :host([disabled]) { opacity: 0.5; }

    [part="check"] { display: none; }
    :host(:state(checkable)) [part="check"] { display: inline-flex; visibility: hidden; }
    :host(:state(checkable):state(selected)) [part="check"] { visibility: visible; }

    [part="content"] { display: flex; flex-direction: column; min-width: 0; }
    [part="description"] { font-size: 0.875em; opacity: 0.75; }
    [part="description"][hidden] { display: none; }
  </style>
  <span part="check"><ce-icon name="check"></ce-icon></span>
  <slot name="start"></slot>
  <span part="content">
    <span part="label"><slot></slot></span>
    <span part="description" hidden><slot name="description"></slot></span>
  </span>
`;

/** How the owning select wants the option shown. */
export type OptionView = {
  /** Currently selected (not the `selected` attribute, which is the default). */
  selected: boolean;
  highlighted: boolean;
  /** Hidden by the select's search filter. */
  filteredOut: boolean;
  /** Show the check mark column (multiple selection). */
  showCheck: boolean;
};

/**
 * An option of a `ce-select`. Has no behaviour of its own: the select reads
 * its data and tells it how to look through `setView()`.
 *
 * @attr value - Submitted value. Defaults to the label.
 * @attr disabled - Can't be picked by the user.
 * @attr selected - Selected by default, like native `<option selected>`.
 * @slot - The label.
 * @slot start - Decorative content before the label, such as an unlabeled `<ce-icon>`.
 * @slot description - Secondary text under the label.
 * @csspart check - The check mark shown for selected options in multiple mode.
 * @csspart label - The label.
 * @csspart description - The description.
 */
export class CeOption extends HTMLElement {
  static observedAttributes: string[] = ["disabled"];

  #initialized = false;

  #internals: ElementInternals;

  #description: HTMLElement | null = null;

  constructor() {
    super();
    this.#internals = this.attachInternals();
    this.#internals.role = "option";
    this.#internals.ariaSelected = "false";
  }

  /** Reflects the `value` attribute, falling back to the label. */
  get value(): string {
    return this.getAttribute("value") ?? this.label;
  }

  set value(value: string) {
    this.setAttribute("value", value);
  }

  /** Text of the default slot's content, with whitespace collapsed. */
  get label(): string {
    return slottedText(this);
  }

  /** Text of the `description` slot's content, with whitespace collapsed. */
  get description(): string {
    return slottedText(this, "description");
  }

  /** Reflects the `disabled` attribute. */
  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }

  set disabled(value: boolean) {
    this.toggleAttribute("disabled", Boolean(value));
  }

  /** Reflects the `selected` attribute: selected by default. */
  get defaultSelected(): boolean {
    return this.hasAttribute("selected");
  }

  set defaultSelected(value: boolean) {
    this.toggleAttribute("selected", Boolean(value));
  }

  /** Whether the owning select currently has this option selected. */
  get selected(): boolean {
    return this.#internals.states.has("selected");
  }

  connectedCallback(): void {
    if (!this.#initialized) {
      this.#setup();
      this.#initialized = true;
    }

    this.refresh();
    this.#updateDisabled();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (!this.#initialized) {
      return;
    }

    if (oldValue === newValue) {
      return;
    }

    if (name === "disabled") {
      this.#updateDisabled();
      return;
    }
  }

  /**
   * Updates the accessible name and description from the content.
   * @internal Called by the owning select when the option's text changed.
   */
  refresh(): void {
    const label = this.label;
    const description = this.description;

    // Set explicitly, so the description and icons don't end up in the name.
    this.#internals.ariaLabel = label === "" ? null : label;
    this.#internals.ariaDescription = description === "" ? null : description;

    if (this.#description) {
      this.#description.hidden = description === "";
    }
  }

  /** @internal Called by the owning select. */
  setView(view: OptionView): void {
    setState(this.#internals, "selected", view.selected);
    setState(this.#internals, "highlighted", view.highlighted);
    setState(this.#internals, "filtered-out", view.filteredOut);
    setState(this.#internals, "checkable", view.showCheck);

    this.#internals.ariaSelected = view.selected ? "true" : "false";
  }

  #setup() {
    const root = this.attachShadow({ mode: "open" });
    root.append(template.content.cloneNode(true));

    this.#description = requireElement(root, "[part='description']", HTMLElement);

    // Children added or removed (including while the parser fills the
    // option in). Text edits inside them are reported by the select.
    for (const slot of root.querySelectorAll("slot")) {
      slot.addEventListener("slotchange", () => {
        this.refresh();
      });
    }
  }

  #updateDisabled() {
    this.#internals.ariaDisabled = this.disabled ? "true" : null;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ce-option": CeOption;
  }
}

defineElement("ce-option", CeOption);
