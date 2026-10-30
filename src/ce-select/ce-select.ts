import { defineElement } from "../core/dom.ts";
import { setupFieldLabel } from "../core/field-label.ts";
import { FormControl } from "../core/form-control.ts";
import { submitImplicitly } from "../core/implicit-submit.ts";
import { createTypeaheadBuffer, navigationKey, pushTypeahead } from "../core/list-navigation.ts";
import { CeOption } from "./ce-option.ts";
import * as logic from "./logic.ts";
import type { Changes, Config } from "./logic.ts";
import * as render from "./render.ts";
import type { SelectContext } from "./render.ts";

/** Attributes of `ce-option` that the select reads. */
const OPTION_ATTRIBUTES = ["value", "disabled", "selected"];

export type SearchEventDetail = {
  query: string;
};

/**
 * Select, single or `multiple`, optionally `searchable`. Options are
 * `ce-option` children.
 *
 * Follows the WAI-ARIA combobox pattern: select-only by default, editable
 * with a text input when searchable.
 *
 * @attr placeholder - Shown when nothing is selected.
 * @attr multiple - Allows selecting several options.
 * @attr searchable - Adds a text input that filters the options.
 * @attr no-filter - With `searchable`: don't filter, e.g. when the app loads matching options itself.
 * @attr with-clear - Shows a button that clears the selection. Backspace / Delete remove the last value (multiple) or clear; with Cmd / Ctrl they clear everything. Always on in searchable single mode, like a search field; hide the button with `::part(clear-button)` to opt out.
 * @slot - `ce-option` elements.
 * @slot label - Rich label content. Overrides the `label` attribute.
 * @slot clear-icon - Replaces the clear button's default icon.
 * @csspart label - The label.
 * @csspart base - The trigger box.
 * @csspart display - The selected options' labels, or the placeholder.
 * @csspart selected-option - One selected option's label, with its value in `data-value`.
 * @csspart input - The search input (searchable only).
 * @csspart clear-button - The clear button.
 * @csspart chevron - The chevron icon.
 * @csspart listbox - The popup with the options.
 * @csspart no-results - Shown in the popup when a search matches nothing.
 * @fires input - When the user changes the selection.
 * @fires change - When the user changes the selection.
 * @fires search - When the user edits the search text. `detail.query` holds it.
 */
export class CeSelect extends FormControl {
  static observedAttributes: string[] = [
    "placeholder",
    "label",
    "multiple",
    "name",
    "searchable",
    "no-filter",
    "with-clear",
  ];

  /** Exists from the start, so values set before connecting are kept. */
  #state = logic.createState();

  /** Created on first connect; until then nothing is rendered. */
  #context: SelectContext | null = null;

  #typeahead = createTypeaheadBuffer();

  /** Reports option changes: added, removed, edited text or attributes. */
  #observer = new MutationObserver((records) => {
    this.#onMutations(records);
  });

  /**
   * The first selected value, or "" when nothing is selected, like native
   * `<select>`. Setting it selects just that value; "" clears.
   */
  get value(): string {
    return logic.formValues(this.#state)[0] ?? "";
  }

  set value(value: string) {
    this.#render(logic.setValues(this.#state, value === "" ? [] : [value]));
  }

  /**
   * All selected values in selection order, including values whose option
   * isn't currently among the children.
   */
  get values(): string[] {
    return logic.formValues(this.#state);
  }

  set values(values: string[]) {
    this.#render(logic.setValues(this.#state, values));
  }

  /** The selected `ce-option` elements in document order, like native `<select>`. */
  get selectedOptions(): CeOption[] {
    const result: CeOption[] = [];

    if (!this.#context) {
      return result;
    }

    // The map holds the first element per value, in document order.
    for (const [value, element] of this.#context.elements) {
      if (logic.isSelected(this.#state, value)) {
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

  /** Reflects the `searchable` attribute. */
  get searchable(): boolean {
    return this.hasAttribute("searchable");
  }

  set searchable(value: boolean) {
    this.toggleAttribute("searchable", Boolean(value));
  }

  /** Reflects the `no-filter` attribute. */
  get noFilter(): boolean {
    return this.hasAttribute("no-filter");
  }

  set noFilter(value: boolean) {
    this.toggleAttribute("no-filter", Boolean(value));
  }

  /** Reflects the `with-clear` attribute. */
  get withClear(): boolean {
    return this.hasAttribute("with-clear");
  }

  set withClear(value: boolean) {
    this.toggleAttribute("with-clear", Boolean(value));
  }

  /** Reflects the `placeholder` attribute. */
  get placeholder(): string {
    return this.getAttribute("placeholder") ?? "";
  }

  set placeholder(value: string) {
    this.setAttribute("placeholder", value);
  }

  connectedCallback(): void {
    if (!this.#context) {
      this.#setup();
    }

    const context = this.#context;

    if (!context) {
      return;
    }

    this.#observer.observe(this, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: OPTION_ATTRIBUTES,
    });

    this.#render(logic.setConfig(this.#state, this.#configFromAttributes()));
    this.#switchTrigger();
    this.#syncOptions();
    this.#updateDisabled();
    render.label(context);
    render.selection(context);
    render.clearButton(context);
  }

  disconnectedCallback(): void {
    this.#observer.disconnect();

    if (this.#context) {
      clearTimeout(this.#context.announceTimer);
      cancelAnimationFrame(this.#context.scrollFrame);
    }

    this.#render(logic.closeList(this.#state));
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    const context = this.#context;

    // Before setup, connectedCallback reads the attributes itself.
    if (!context) {
      return;
    }

    if (oldValue === newValue) {
      return;
    }

    if (name === "placeholder") {
      render.selection(context);
      render.input(context);
      return;
    }

    if (name === "label") {
      render.label(context);
      return;
    }

    if (name === "with-clear") {
      render.clearButton(context);
      return;
    }

    if (name === "multiple" || name === "no-filter") {
      this.#render(logic.setConfig(this.#state, this.#configFromAttributes()));
      return;
    }

    if (name === "searchable") {
      // Before the switch: taking the role away from the focused trigger blurs it.
      const hadFocus = this.matches(":focus-within");

      this.#render(logic.setConfig(this.#state, this.#configFromAttributes()));
      this.#switchTrigger();

      if (hadFocus) {
        render.trigger(context).focus();
      }

      return;
    }

    // The form value of multiple selects is keyed by name.
    if (name === "name") {
      render.selection(context);
      return;
    }
  }

  formDisabledCallback(): void {
    // Can run before connectedCallback, before the options are upgraded;
    // connectedCallback applies the disabled state itself.
    if (!this.#context) {
      return;
    }

    this.#updateDisabled();
  }

  formResetCallback(): void {
    this.#render(logic.reset(this.#state));
  }

  formStateRestoreCallback(state: string | File | FormData | null): void {
    if (typeof state === "string") {
      this.#render(logic.setValues(this.#state, [state]));
      return;
    }

    if (!(state instanceof FormData)) {
      return;
    }

    // Multiple: the FormData saved by render.selection, one entry per value.
    const values: string[] = [];

    for (const [, value] of state) {
      if (typeof value === "string") {
        values.push(value);
      }
    }

    this.#render(logic.setValues(this.#state, values));
  }

  #setup() {
    const context = render.createContext(this, this.internals, this.#state);
    const { box, input, clearButton, listbox } = context.refs;

    // On the box only: the input is inside it, so its events bubble here.
    box.addEventListener("keydown", this.#onKeydown);
    box.addEventListener("focusout", this.#onFocusout);
    box.addEventListener("mousedown", this.#onBoxMousedown);

    clearButton.addEventListener("mousedown", this.#onClearMousedown);
    clearButton.addEventListener("click", this.#onClearClick);

    input.addEventListener("input", this.#onSearchInput);
    input.addEventListener("focus", this.#onInputFocus);

    listbox.addEventListener("mousedown", this.#onListboxMousedown);
    listbox.addEventListener("mouseup", this.#onListboxMouseup);
    listbox.addEventListener("pointermove", this.#onListboxPointermove);

    setupFieldLabel(this, context.root, () => {
      render.label(context);
    });

    this.#context = context;
  }

  #configFromAttributes(): Partial<Config> {
    return {
      multiple: this.multiple,
      searchable: this.searchable,
      filter: !this.noFilter,
    };
  }

  /** Updates everything affected by `changes`. Nothing is rendered before setup. */
  #render(changes: Changes) {
    const context = this.#context;

    if (!context || changes.size === 0) {
      return;
    }

    // When the options changed, #syncOptions renders every option itself.
    const haveOptionsChanged = changes.has("options");

    if (changes.has("selection")) {
      render.selection(context);
    }

    if (changes.has("selection") && !haveOptionsChanged) {
      render.selectionChange(context);
    }

    if (changes.has("open")) {
      render.open(context);
    }

    if (changes.has("navigation") && !haveOptionsChanged) {
      render.highlightChange(context);
    }

    if (changes.has("query") || changes.has("config")) {
      render.filter(context, !haveOptionsChanged);
    }

    if (changes.has("selection") || changes.has("query") || changes.has("config")) {
      render.input(context);
      render.clearButton(context);
    }

    if (changes.has("config")) {
      render.disabled(context);
      render.multiple(context);
    }

    // The check mark column changes on every option.
    if (changes.has("config") && context.rendered.multiple !== this.#state.config.multiple) {
      render.allOptions(context);
    }

    // Pressing outside closes the list; only listened to while open.
    if (changes.has("open") && this.#state.open) {
      document.addEventListener("mousedown", this.#onDocumentMousedown);
    }

    // Always remove when closed: taken out of the page, the browser may
    // already have hidden the popover.
    if (!this.#state.open) {
      document.removeEventListener("mousedown", this.#onDocumentMousedown);
    }
  }

  /**
   * Gives the combobox role to the input (searchable) or the box, and
   * redraws what depends on which one it is.
   */
  #switchTrigger() {
    const context = this.#context;

    if (!context) {
      return;
    }

    render.triggerRole(context);
    render.disabled(context);
    render.activeDescendant(context);
    render.selection(context);
    render.input(context);
    render.label(context);
  }

  /** `input` and `change` when the user changed the selection. */
  #fireChangeEvents(changes: Changes) {
    if (!changes.has("selection")) {
      return;
    }

    this.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
    this.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /** Renders a user action and fires its events. */
  #renderUserChange(changes: Changes) {
    this.#render(changes);
    this.#fireChangeEvents(changes);
  }

  #updateDisabled() {
    if (!this.#context) {
      return;
    }

    this.#render(logic.setConfig(this.#state, { disabled: this.matches(":disabled") }));
    render.disabled(this.#context);
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
    const context = this.#context;

    if (!context) {
      return;
    }

    this.#render(logic.setOptions(this.#state, render.collectOptions(context)));

    // New options may match or miss the current search, and the elements
    // may be new even when the data didn't change: render every option.
    render.filter(context, false);
    render.allOptions(context);
  }

  // Keyboard (WAI-ARIA combobox: select-only, or editable when searchable)

  #onKeydown = (event: KeyboardEvent) => {
    if (this.#state.config.disabled) {
      return;
    }

    // Enter and other keys confirm IME composition instead.
    if (event.isComposing) {
      return;
    }

    const inputText = this.#context?.refs.input.value ?? "";

    // with-clear: Backspace / Delete remove the last value (multiple) or
    // clear; with Cmd / Ctrl they clear everything.
    const clear = logic.clearForKey(this.#state, event, this.withClear, inputText);

    if (clear === "last") {
      event.preventDefault();
      this.#renderUserChange(logic.removeLastSelected(this.#state));
      return;
    }

    if (clear === "all") {
      event.preventDefault();
      this.#renderUserChange(logic.clearSelection(this.#state));
      return;
    }

    if (logic.shouldSubmitOnEnter(this.#state, event)) {
      submitImplicitly(this);
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

    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      this.#render(logic.openList(this.#state));
      return;
    }

    // Searchable: Space, Home, End and characters edit the text instead.
    if (this.#state.config.searchable) {
      return;
    }

    if (key === "Enter" || key === " ") {
      event.preventDefault();
      this.#render(logic.openList(this.#state));
      return;
    }

    if (key === "Home" || key === "End") {
      event.preventDefault();
      this.#render(logic.openList(this.#state, key === "Home" ? "first" : "last"));
      return;
    }

    if (logic.isPrintable(event)) {
      event.preventDefault();
      this.#typeaheadKey(event);
      return;
    }
  }

  #onOpenKeydown(event: KeyboardEvent) {
    const key = event.key;
    const isMultiple = this.#state.config.multiple;
    const isSearchable = this.#state.config.searchable;

    if (key === "Escape") {
      // Close only the popup, not a surrounding dialog. Erased search text
      // clears, like Tab or pressing outside.
      event.preventDefault();
      event.stopPropagation();
      this.#renderUserChange(logic.dismiss(this.#state));
      return;
    }

    // Tab lets focus move on; single usually picks the highlighted option
    // first. Otherwise it leaves right away (closing, or clearing erased
    // text), so the list is closed before the browser looks for the next
    // focusable element: searching an open list of thousands of options for
    // one takes seconds.
    if (key === "Tab" && logic.shouldSelectOnTab(this.#state)) {
      this.#renderUserChange(logic.selectHighlighted(this.#state));
      return;
    }

    if (key === "Tab") {
      this.#renderUserChange(logic.dismiss(this.#state));
      return;
    }

    // Alt+ArrowUp: single selects and closes, multiple just closes.
    if (key === "ArrowUp" && event.altKey && isMultiple) {
      event.preventDefault();
      this.#render(logic.closeList(this.#state));
      return;
    }

    if (key === "ArrowUp" && event.altKey) {
      event.preventDefault();
      this.#renderUserChange(logic.selectHighlighted(this.#state));
      return;
    }

    // Enter: single selects and closes, multiple toggles and stays open.
    if (key === "Enter") {
      event.preventDefault();
      this.#renderUserChange(logic.selectHighlighted(this.#state));
      return;
    }

    // Searchable: Home and End move the caret, Space types.
    if (isSearchable && (key === "Home" || key === "End" || key === " ")) {
      return;
    }

    // Space continues a type-ahead search ("New York"), otherwise like Enter.
    if (key === " " && !this.#isTyping(event)) {
      event.preventDefault();
      this.#renderUserChange(logic.selectHighlighted(this.#state));
      return;
    }

    const to = navigationKey(event, "vertical");

    if (to) {
      event.preventDefault();
      this.#render(logic.moveHighlight(this.#state, to));
      return;
    }

    // Searchable: characters go into the input.
    if (logic.isPrintable(event) && !isSearchable) {
      event.preventDefault();
      this.#typeaheadKey(event);
      return;
    }
  }

  #typeaheadKey(event: KeyboardEvent) {
    const text = pushTypeahead(this.#typeahead, event.key, event.timeStamp);

    this.#render(logic.typeahead(this.#state, text));
  }

  #isTyping(event: KeyboardEvent): boolean {
    const buffer = this.#typeahead;

    return buffer.text !== "" && event.timeStamp - buffer.time <= buffer.timeout;
  }

  // Search input

  #onSearchInput = (event: Event) => {
    // Our `input` event means "the value changed"; typing isn't that.
    event.stopPropagation();

    if (!this.#context) {
      return;
    }

    const query = this.#context.refs.input.value;

    this.#render(logic.search(this.#state, query));

    const detail: SearchEventDetail = { query };

    this.dispatchEvent(new CustomEvent("search", { bubbles: true, composed: true, detail }));
  };

  // Typing replaces the shown label instead of appending to it.
  #onInputFocus = () => {
    this.#context?.refs.input.select();
  };

  // Mouse

  #onBoxMousedown = (event: MouseEvent) => {
    const context = this.#context;

    if (!context || event.button !== 0 || this.#state.config.disabled) {
      return;
    }

    // Searchable: pressing the input places the caret as usual and opens.
    if (this.#state.config.searchable && event.target === context.refs.input) {
      this.#render(logic.openList(this.#state));
      return;
    }

    // Keep focus on the trigger and avoid selecting text.
    event.preventDefault();
    render.trigger(context).focus();

    if (this.#state.open) {
      this.#render(logic.closeList(this.#state));
      return;
    }

    this.#render(logic.openList(this.#state));
  };

  // Pressing the clear button mustn't move focus or count as pressing the box.
  #onClearMousedown = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  #onClearClick = () => {
    const context = this.#context;

    if (!context) {
      return;
    }

    this.#renderUserChange(logic.clearSelection(this.#state));
    render.trigger(context).focus();
  };

  // Pressing in the list mustn't move focus off the trigger.
  #onListboxMousedown = (event: MouseEvent) => {
    event.preventDefault();
  };

  // Selecting on release also allows press on the trigger, drag, release.
  #onListboxMouseup = (event: MouseEvent) => {
    const context = this.#context;

    if (!context || event.button !== 0) {
      return;
    }

    const option = owningOption(event.target);

    if (!option || option.disabled) {
      return;
    }

    // Focus stays on the trigger (pressing in the list didn't move it).
    render.trigger(context).focus();

    if (this.#state.config.multiple) {
      this.#renderUserChange(logic.toggleOption(this.#state, option.value));
      return;
    }

    this.#renderUserChange(logic.selectOption(this.#state, option.value));
  };

  // Pointer movement only: content scrolling under a still pointer (e.g.
  // while using the keyboard) mustn't move the highlight.
  #onListboxPointermove = (event: PointerEvent) => {
    const option = owningOption(event.target);

    if (!option) {
      return;
    }

    this.#render(logic.highlightOption(this.#state, option.value));
  };

  // Pressing outside means leaving: like blur, it clears erased search text.
  #onDocumentMousedown = (event: MouseEvent) => {
    if (event.composedPath().includes(this)) {
      return;
    }

    this.#renderUserChange(logic.dismiss(this.#state));
  };

  #onFocusout = (event: FocusEvent) => {
    const next = event.relatedTarget;

    if (next instanceof Node && (this.contains(next) || this.shadowRoot?.contains(next))) {
      return;
    }

    // Searchable: leaving with the text erased clears the selection.
    this.#renderUserChange(logic.dismiss(this.#state));
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

declare global {
  interface HTMLElementTagNameMap {
    "ce-select": CeSelect;
  }

  interface HTMLElementEventMap {
    search: CustomEvent<SearchEventDetail>;
  }
}

defineElement("ce-select", CeSelect);
