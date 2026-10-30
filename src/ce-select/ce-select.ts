import "../ce-icon/ce-icon.ts";
import { defineElement, requireElement, setState } from "../core/dom.ts";
import {
  labelMarkup,
  labelStyles,
  setupFieldLabel,
  updateFieldLabel,
} from "../core/field-label.ts";
import { FormControl } from "../core/form-control.ts";
import { createTypeaheadBuffer, navigationKey, pushTypeahead } from "../core/list-navigation.ts";
import { CeOption } from "./ce-option.ts";
import { createState, displayText, formValues, isSelected, reduce } from "./select-state.ts";
import type { Action, Field, Option, State } from "./select-state.ts";

const template = document.createElement("template");
template.innerHTML = `
  <style>
    :host { display: inline-block; }

    ${labelStyles}

    [part="base"] {
      anchor-name: --trigger;
      display: flex;
      align-items: center;
      gap: 0.25em;
      box-sizing: border-box;
      width: 100%;
      min-width: 10em;
      padding: 0.125em 0.25em;
      border: 1px solid #767676;
      border-radius: 2px;
      background: Field;
      color: FieldText;
      cursor: default;
      user-select: none;
    }

    [part="base"]:focus-visible { outline: 2px solid AccentColor; outline-offset: 1px; }
    :host(:disabled) [part="base"] { opacity: 0.5; }

    [part="display"] {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    :host(:state(blank)) [part="display"] { opacity: 0.6; }

    [part="selected-option"]:not(:last-child)::after { content: ", "; }

    [part="chevron"] { flex: none; }
    :host(:state(open)) [part="chevron"] { rotate: 180deg; }

    [part="listbox"] {
      position-anchor: --trigger;
      position-try-fallbacks: flip-block;
      inset: auto;
      top: anchor(bottom);
      left: anchor(left);
      width: anchor-size(width);
      max-height: 20em;
      box-sizing: border-box;
      margin: 0;
      padding: 0.25em 0;
      overflow-y: auto;
      border: 1px solid #767676;
      border-radius: 2px;
      background: Canvas;
      color: CanvasText;
    }
  </style>
  ${labelMarkup}
  <div
    part="base"
    role="combobox"
    tabindex="0"
    aria-haspopup="listbox"
    aria-expanded="false"
    aria-controls="listbox"
  >
    <span part="display"></span>
    <ce-icon part="chevron" name="chevron-down"></ce-icon>
  </div>
  <div part="listbox" id="listbox" role="listbox" popover="manual" tabindex="-1">
    <slot></slot>
  </div>
`;

/** Attributes of `ce-option` that the select reads. */
const OPTION_ATTRIBUTES = ["value", "disabled", "selected"];

/**
 * Select (WAI-ARIA select-only combobox), single or `multiple`. Options are
 * `ce-option` children.
 *
 * @attr placeholder - Shown when nothing is selected.
 * @attr multiple - Allows selecting several options.
 * @slot - `ce-option` elements.
 * @slot label - Rich label content. Overrides the `label` attribute.
 * @csspart label - The label.
 * @csspart base - The trigger box.
 * @csspart display - The selected options' labels, or the placeholder.
 * @csspart selected-option - One selected option's label, with its value in `data-value`.
 * @csspart chevron - The chevron icon.
 * @csspart listbox - The popup with the options.
 * @fires input - When the user changes the selection.
 * @fires change - When the user changes the selection.
 */
export class CeSelect extends FormControl {
  static observedAttributes: string[] = ["placeholder", "label", "multiple", "name"];

  #initialized = false;

  #state: State = createState();

  #typeahead = createTypeaheadBuffer();

  #trigger: HTMLElement | null = null;

  #display: HTMLElement | null = null;

  #listbox: HTMLElement | null = null;

  /** Reports option changes: added, removed, edited text or attributes. */
  #observer = new MutationObserver((records) => {
    this.#onMutations(records);
  });

  /**
   * The first selected value, or "" when nothing is selected, like native
   * `<select>`. Setting it selects just that value; "" clears.
   */
  get value(): string {
    return formValues(this.#state)[0] ?? "";
  }

  set value(value: string) {
    this.#dispatch({ type: "SET_VALUE", values: value === "" ? [] : [value] });
  }

  /**
   * All selected values in selection order, including values whose option
   * isn't currently among the children.
   */
  get values(): string[] {
    return formValues(this.#state);
  }

  set values(values: string[]) {
    this.#dispatch({ type: "SET_VALUE", values });
  }

  /** The selected `ce-option` elements in document order, like native `<select>`. */
  get selectedOptions(): CeOption[] {
    const result: CeOption[] = [];
    const seen = new Set<string>();

    for (const element of this.querySelectorAll("ce-option")) {
      // Only the first of duplicate values counts.
      if (seen.has(element.value)) {
        continue;
      }

      seen.add(element.value);

      if (isSelected(this.#state, element.value)) {
        result.push(element);
      }
    }

    return result;
  }

  /** Reflects the `multiple` attribute. */
  get multiple(): boolean {
    return this.hasAttribute("multiple");
  }

  set multiple(value: boolean) {
    this.toggleAttribute("multiple", Boolean(value));
  }

  /** Reflects the `placeholder` attribute. */
  get placeholder(): string {
    return this.getAttribute("placeholder") ?? "";
  }

  set placeholder(value: string) {
    this.setAttribute("placeholder", value);
  }

  connectedCallback(): void {
    if (!this.#initialized) {
      this.#setup();
      this.#initialized = true;
    }

    this.#observer.observe(this, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: OPTION_ATTRIBUTES,
    });

    this.#dispatch({ type: "CONFIG", config: { multiple: this.multiple } });
    this.#syncOptions();
    this.#updateDisabled();
    this.#updateLabel();
    this.#renderSelection();
  }

  disconnectedCallback(): void {
    this.#observer.disconnect();
    this.#dispatch({ type: "CLOSE" });
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (!this.#initialized) {
      return;
    }

    if (oldValue === newValue) {
      return;
    }

    if (name === "placeholder") {
      this.#renderSelection();
      return;
    }

    if (name === "label") {
      this.#updateLabel();
      return;
    }

    if (name === "multiple") {
      this.#dispatch({ type: "CONFIG", config: { multiple: this.multiple } });
      return;
    }

    // The form value of multiple selects is keyed by name.
    if (name === "name") {
      this.#renderSelection();
      return;
    }
  }

  formDisabledCallback(): void {
    // Can run before connectedCallback, before the options are upgraded;
    // connectedCallback applies the disabled state itself.
    if (!this.#initialized) {
      return;
    }

    this.#updateDisabled();
  }

  formResetCallback(): void {
    this.#dispatch({ type: "RESET" });
  }

  formStateRestoreCallback(state: string | File | FormData | null): void {
    if (typeof state === "string") {
      this.#dispatch({ type: "RESTORE", values: [state] });
      return;
    }

    if (!(state instanceof FormData)) {
      return;
    }

    // Multiple: the FormData saved by #renderSelection, one entry per value.
    const values: string[] = [];

    for (const [, value] of state) {
      if (typeof value === "string") {
        values.push(value);
      }
    }

    this.#dispatch({ type: "RESTORE", values });
  }

  #setup() {
    const root = this.attachShadow({ mode: "open", delegatesFocus: true });
    root.append(template.content.cloneNode(true));

    const trigger = requireElement(root, "[part='base']", HTMLElement);
    const listbox = requireElement(root, "[part='listbox']", HTMLElement);

    trigger.addEventListener("keydown", this.#onKeydown);
    trigger.addEventListener("mousedown", this.#onTriggerMousedown);
    trigger.addEventListener("focusout", this.#onFocusout);

    listbox.addEventListener("mousedown", this.#onListboxMousedown);
    listbox.addEventListener("mouseup", this.#onListboxMouseup);
    listbox.addEventListener("pointermove", this.#onListboxPointermove);

    this.#trigger = trigger;
    this.#display = requireElement(root, "[part='display']", HTMLElement);
    this.#listbox = listbox;

    setupFieldLabel(this, root, trigger);
  }

  /**
   * Runs the action through the reducer and updates what changed.
   * @param user The user caused it; fire `input` / `change` if the value changed.
   */
  #dispatch(action: Action, user = false) {
    const changes = reduce(this.#state, action);

    if (changes.size === 0) {
      return;
    }

    this.#render(changes);

    if (!user || !changes.has("selection")) {
      return;
    }

    this.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
    this.dispatchEvent(new Event("change", { bubbles: true }));
  }

  #render(changes: Set<Field>) {
    if (changes.has("selection")) {
      this.#renderSelection();
    }

    if (changes.has("open")) {
      this.#renderOpen();
    }

    if (changes.has("options") || changes.has("selection") || changes.has("navigation")) {
      this.#renderOptions();
    }

    if (changes.has("navigation") || changes.has("open")) {
      this.#renderHighlight();
    }

    if (changes.has("config")) {
      this.#renderDisabled();
      this.#renderMultiple();
      this.#renderOptions();
    }
  }

  // Options

  #onMutations(records: MutationRecord[]) {
    // Text edits don't change an option's slots, so it can't notice them.
    for (const record of records) {
      const option = owningOption(record.target);

      if (option) {
        option.refresh();
      }
    }

    this.#syncOptions();
  }

  #syncOptions() {
    this.#dispatch({ type: "OPTIONS_CHANGED", options: this.#readOptions() });

    // New elements with the same data report no change, but still need
    // their view.
    this.#renderOptions();
  }

  #readOptions(): Option[] {
    const options: Option[] = [];

    for (const element of this.querySelectorAll("ce-option")) {
      options.push({
        value: element.value,
        label: element.label,
        disabled: element.disabled,
        defaultSelected: element.defaultSelected,
      });
    }

    return options;
  }

  /** The element of an option value. With duplicate values, the first one. */
  #optionElement(value: string | null): CeOption | null {
    if (value === null) {
      return null;
    }

    for (const element of this.querySelectorAll("ce-option")) {
      if (element.value === value) {
        return element;
      }
    }

    return null;
  }

  // Rendering

  #renderSelection() {
    if (!this.#display) {
      return;
    }

    const blank = this.#state.selection.length === 0;

    setState(this.internals, "blank", blank);
    this.#display.title = blank ? "" : displayText(this.#state);
    this.internals.setFormValue(this.#formValue());

    if (blank) {
      this.#display.textContent = this.placeholder;
      return;
    }

    // One span per label, so they can be styled or replaced later. Commas
    // come from CSS.
    const spans: HTMLSpanElement[] = [];

    for (const selected of this.#state.selection) {
      const span = document.createElement("span");
      span.part.add("selected-option");
      span.dataset.value = selected.value;
      span.textContent = selected.label ?? selected.value;
      spans.push(span);
    }

    this.#display.replaceChildren(...spans);
  }

  /** Single: the value. Multiple: one `name=value` entry per value. */
  #formValue(): string | FormData | null {
    const values = formValues(this.#state);

    if (values.length === 0) {
      return null;
    }

    if (!this.#state.config.multiple) {
      return values[0] ?? null;
    }

    if (this.name === "") {
      return null;
    }

    const data = new FormData();

    for (const value of values) {
      data.append(this.name, value);
    }

    return data;
  }

  #renderOpen() {
    if (!this.#trigger || !this.#listbox) {
      return;
    }

    const open = this.#state.open;

    this.#trigger.ariaExpanded = open ? "true" : "false";
    setState(this.internals, "open", open);

    if (open) {
      document.addEventListener("mousedown", this.#onDocumentMousedown);

      if (!this.#listbox.matches(":popover-open")) {
        this.#listbox.showPopover();
      }

      return;
    }

    // Always remove: when the select is taken out of the page the browser
    // may already have hidden the popover.
    document.removeEventListener("mousedown", this.#onDocumentMousedown);

    if (this.#listbox.matches(":popover-open")) {
      this.#listbox.hidePopover();
    }
  }

  #renderOptions() {
    const seen = new Set<string>();
    const highlighted = this.#state.navigation.highlighted;

    for (const element of this.querySelectorAll("ce-option")) {
      const value = element.value;

      // Later duplicates of a value can't be selected or highlighted.
      const duplicate = seen.has(value);
      seen.add(value);

      element.setView({
        selected: !duplicate && isSelected(this.#state, value),
        highlighted: !duplicate && highlighted === value,
        filteredOut: false,
        showCheck: this.#state.config.multiple,
      });
    }
  }

  #renderHighlight() {
    if (!this.#trigger || !this.#listbox) {
      return;
    }

    const element = this.#optionElement(this.#state.navigation.highlighted);

    this.#trigger.ariaActiveDescendantElement = element;

    if (!element) {
      return;
    }

    scrollIntoList(this.#listbox, element);
  }

  #renderDisabled() {
    if (!this.#trigger) {
      return;
    }

    const disabled = this.#state.config.disabled;

    this.#trigger.ariaDisabled = disabled ? "true" : null;

    // No tabindex at all, not -1: with delegatesFocus, pressing anywhere in
    // the component would still focus a tabindex="-1" trigger.
    if (disabled) {
      this.#trigger.removeAttribute("tabindex");
      return;
    }

    this.#trigger.tabIndex = 0;
  }

  #renderMultiple() {
    if (!this.#listbox) {
      return;
    }

    this.#listbox.ariaMultiSelectable = this.#state.config.multiple ? "true" : null;
  }

  #updateDisabled() {
    this.#dispatch({ type: "CONFIG", config: { disabled: this.matches(":disabled") } });
    this.#renderDisabled();
  }

  #updateLabel() {
    if (!this.shadowRoot || !this.#trigger || !this.#listbox) {
      return;
    }

    updateFieldLabel(this, this.shadowRoot, this.#trigger);

    // The listbox is named by the same label.
    this.#listbox.ariaLabelledByElements = this.#trigger.ariaLabelledByElements;
  }

  // Keyboard (WAI-ARIA select-only combobox)

  #onKeydown = (event: KeyboardEvent) => {
    if (this.#state.config.disabled) {
      return;
    }

    if (!this.#state.open) {
      this.#onClosedKeydown(event);
      return;
    }

    this.#onOpenKeydown(event);
  };

  #onClosedKeydown(event: KeyboardEvent) {
    const key = event.key;

    if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") {
      event.preventDefault();
      this.#dispatch({ type: "OPEN" });
      return;
    }

    if (key === "Home" || key === "End") {
      event.preventDefault();
      this.#dispatch({ type: "OPEN", highlight: key === "Home" ? "first" : "last" });
      return;
    }

    if (isPrintable(event)) {
      event.preventDefault();
      this.#typeaheadKey(event);
      return;
    }
  }

  #onOpenKeydown(event: KeyboardEvent) {
    const key = event.key;

    if (key === "Escape") {
      // Close only the popup, not a surrounding dialog.
      event.preventDefault();
      event.stopPropagation();
      this.#dispatch({ type: "CLOSE" });
      return;
    }

    const multiple = this.#state.config.multiple;

    // Tab lets focus move on. Single: picks the highlighted option first.
    if (key === "Tab") {
      this.#dispatch({ type: multiple ? "CLOSE" : "SELECT_HIGHLIGHTED" }, true);
      return;
    }

    // Single: select and close. Multiple: just close.
    if (key === "ArrowUp" && event.altKey) {
      event.preventDefault();
      this.#dispatch({ type: multiple ? "CLOSE" : "SELECT_HIGHLIGHTED" }, true);
      return;
    }

    // Single: select and close. Multiple: toggle and stay open.
    if (key === "Enter") {
      event.preventDefault();
      this.#dispatch({ type: "SELECT_HIGHLIGHTED" }, true);
      return;
    }

    // Space continues a type-ahead search ("New York"), otherwise like Enter.
    if (key === " " && !this.#isTyping(event)) {
      event.preventDefault();
      this.#dispatch({ type: "SELECT_HIGHLIGHTED" }, true);
      return;
    }

    const to = navigationKey(event, "vertical");

    if (to) {
      event.preventDefault();
      this.#dispatch({ type: "HIGHLIGHT", to });
      return;
    }

    if (isPrintable(event)) {
      event.preventDefault();
      this.#typeaheadKey(event);
      return;
    }
  }

  #typeaheadKey(event: KeyboardEvent) {
    const text = pushTypeahead(this.#typeahead, event.key, event.timeStamp);

    this.#dispatch({ type: "TYPEAHEAD", text });
  }

  #isTyping(event: KeyboardEvent): boolean {
    const buffer = this.#typeahead;

    return buffer.text !== "" && event.timeStamp - buffer.time <= buffer.timeout;
  }

  // Mouse

  #onTriggerMousedown = (event: MouseEvent) => {
    if (event.button !== 0 || this.#state.config.disabled) {
      return;
    }

    // Keep focus on the trigger and avoid selecting its text.
    event.preventDefault();
    this.#trigger?.focus();

    this.#dispatch({ type: this.#state.open ? "CLOSE" : "OPEN" });
  };

  // Pressing in the list mustn't move focus off the trigger.
  #onListboxMousedown = (event: MouseEvent) => {
    event.preventDefault();
  };

  // Selecting on release also allows press on the trigger, drag, release.
  #onListboxMouseup = (event: MouseEvent) => {
    if (event.button !== 0) {
      return;
    }

    const option = owningOption(event.target);

    if (!option || option.disabled) {
      return;
    }

    const type = this.#state.config.multiple ? "TOGGLE" : "SELECT";

    this.#dispatch({ type, value: option.value }, true);
    this.#trigger?.focus();
  };

  // Pointer movement only: content scrolling under a still pointer (e.g.
  // while using the keyboard) mustn't move the highlight.
  #onListboxPointermove = (event: PointerEvent) => {
    const option = owningOption(event.target);

    if (!option) {
      return;
    }

    this.#dispatch({ type: "HIGHLIGHT", value: option.value });
  };

  #onDocumentMousedown = (event: MouseEvent) => {
    if (event.composedPath().includes(this)) {
      return;
    }

    this.#dispatch({ type: "CLOSE" });
  };

  #onFocusout = (event: FocusEvent) => {
    const next = event.relatedTarget;

    if (next instanceof Node && (this.contains(next) || this.shadowRoot?.contains(next))) {
      return;
    }

    this.#dispatch({ type: "BLUR" });
  };
}

/** The `ce-option` a node belongs to, if any. */
function owningOption(target: EventTarget | null): CeOption | null {
  if (!(target instanceof Node)) {
    return null;
  }

  // Text nodes (from text edits) have no `closest`.
  const element = target instanceof Element ? target : target.parentElement;

  return element?.closest("ce-option") ?? null;
}

function isPrintable(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/** Scrolls `list` just enough to show `item`, without scrolling the page. */
function scrollIntoList(list: HTMLElement, item: HTMLElement): void {
  const listRect = list.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();

  if (itemRect.top < listRect.top) {
    list.scrollTop -= listRect.top - itemRect.top;
    return;
  }

  if (itemRect.bottom > listRect.bottom) {
    list.scrollTop += itemRect.bottom - listRect.bottom;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ce-select": CeSelect;
  }
}

defineElement("ce-select", CeSelect);
