import "../ce-icon/ce-icon.ts";
import { defineElement, requireElement, setState } from "../core/dom.ts";
import {
  labelMarkup,
  labelStyles,
  setupFieldLabel,
  updateFieldLabel,
} from "../core/field-label.ts";
import { FormControl } from "../core/form-control.ts";
import { submitImplicitly } from "../core/implicit-submit.ts";
import { createTypeaheadBuffer, navigationKey, pushTypeahead } from "../core/list-navigation.ts";
import { CeOption } from "./ce-option.ts";
import type { OptionView } from "./ce-option.ts";
import {
  createState,
  displayText,
  formValues,
  isSelected,
  reduce,
  visibleOptions,
} from "./select-state.ts";
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

    [part="base"]:focus-visible,
    [part="base"]:has([part="input"]:focus) {
      outline: 2px solid AccentColor;
      outline-offset: 1px;
    }

    :host(:disabled) [part="base"] { opacity: 0.5; }

    [part="display"] {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    /* Searchable: the display only holds the spans, the input takes the rest. */
    :host(:state(searchable)) [part="display"] { flex: 0 1 auto; }
    [part="display"][hidden] { display: none; }

    :host(:state(blank)) [part="display"] { opacity: 0.6; }

    [part="selected-option"]:not(:last-child)::after { content: ", "; }

    [part="input"] {
      flex: 1;
      min-width: 4em;
      padding: 0;
      border: 0;
      outline: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: text;
    }

    [part="input"][hidden] { display: none; }

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

    [part="no-results"] { padding: 0.375em 0.5em; opacity: 0.75; }
    [part="no-results"][hidden] { display: none; }

    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  </style>
  ${labelMarkup}
  <div part="base">
    <span part="display"></span>
    <input
      part="input"
      type="text"
      hidden
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
    />
    <ce-icon part="chevron" name="chevron-down"></ce-icon>
  </div>
  <div part="listbox" id="listbox" role="listbox" popover="manual" tabindex="-1">
    <div part="no-results" aria-hidden="true" hidden>No results</div>
    <slot></slot>
  </div>
  <div class="visually-hidden" aria-live="polite"></div>
`;

/** Attributes of `ce-option` that the select reads. */
const OPTION_ATTRIBUTES = ["value", "disabled", "selected"];

/** How long typing has to pause before the result count is announced. */
const ANNOUNCE_DELAY = 300;

/** Attributes the combobox role needs, moved between the two triggers. */
const TRIGGER_ATTRIBUTES = ["role", "aria-haspopup", "aria-controls", "aria-expanded"];

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
 * @slot - `ce-option` elements.
 * @slot label - Rich label content. Overrides the `label` attribute.
 * @csspart label - The label.
 * @csspart base - The trigger box.
 * @csspart display - The selected options' labels, or the placeholder.
 * @csspart selected-option - One selected option's label, with its value in `data-value`.
 * @csspart input - The search input (searchable only).
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
  ];

  #initialized = false;

  #state: State = createState();

  #typeahead = createTypeaheadBuffer();

  /** The trigger box: anchor for the popup and the focusable combobox when not searchable. */
  #box: HTMLElement | null = null;

  #display: HTMLElement | null = null;

  /** The focusable combobox when searchable. */
  #input: HTMLInputElement | null = null;

  #listbox: HTMLElement | null = null;

  #noResults: HTMLElement | null = null;

  #liveRegion: HTMLElement | null = null;

  #announceTimer: ReturnType<typeof setTimeout> | undefined;

  /** Pending scroll to the highlighted option, see #scheduleScroll. */
  #scrollFrame = 0;

  /**
   * Option elements by value; the first one for duplicate values. Rebuilt
   * whenever the options are read, so lookups never search the DOM.
   */
  #elements = new Map<string, CeOption>();

  /**
   * What the option elements currently show, so a change only touches the
   * options it affects (a highlight move: two of them, however long the list).
   */
  #renderedHighlight: string | null = null;

  #renderedSelection = new Set<string>();

  #renderedMultiple = false;

  /** Values hidden by the search filter. */
  #renderedHidden = new Set<string>();

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

    // The map holds the first element per value, in document order.
    for (const [value, element] of this.#elements) {
      if (isSelected(this.#state, value)) {
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

    this.#dispatch({ type: "CONFIG", config: this.#configFromAttributes() });
    this.#applyTrigger();
    this.#syncOptions();
    this.#updateDisabled();
    this.#updateLabel();
    this.#renderSelection();
  }

  disconnectedCallback(): void {
    this.#observer.disconnect();
    clearTimeout(this.#announceTimer);
    cancelAnimationFrame(this.#scrollFrame);
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

    if (name === "multiple" || name === "no-filter") {
      this.#dispatch({ type: "CONFIG", config: this.#configFromAttributes() });
      return;
    }

    if (name === "searchable") {
      // Before the switch: taking the role away from the focused trigger blurs it.
      const hadFocus = this.matches(":focus-within");

      this.#dispatch({ type: "CONFIG", config: this.#configFromAttributes() });
      this.#applyTrigger();
      this.#updateLabel();

      if (hadFocus) {
        this.#trigger?.focus();
      }

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

    const box = requireElement(root, "[part='base']", HTMLElement);
    const input = requireElement(root, "[part='input']", HTMLInputElement);
    const listbox = requireElement(root, "[part='listbox']", HTMLElement);

    // On the box only: the input is inside it, so its events bubble here.
    box.addEventListener("keydown", this.#onKeydown);
    box.addEventListener("focusout", this.#onFocusout);
    box.addEventListener("mousedown", this.#onBoxMousedown);
    input.addEventListener("input", this.#onSearchInput);
    input.addEventListener("focus", this.#onInputFocus);

    listbox.addEventListener("mousedown", this.#onListboxMousedown);
    listbox.addEventListener("mouseup", this.#onListboxMouseup);
    listbox.addEventListener("pointermove", this.#onListboxPointermove);

    this.#box = box;
    this.#input = input;
    this.#display = requireElement(root, "[part='display']", HTMLElement);
    this.#listbox = listbox;
    this.#noResults = requireElement(root, "[part='no-results']", HTMLElement);
    this.#liveRegion = requireElement(root, "[aria-live]", HTMLElement);

    setupFieldLabel(this, root, () => {
      this.#updateLabel();
    });
  }

  #configFromAttributes() {
    return {
      multiple: this.multiple,
      searchable: this.searchable,
      filter: !this.noFilter,
    };
  }

  /** The focusable combobox element: the input when searchable, otherwise the box. */
  get #trigger(): HTMLElement | null {
    if (this.#state.config.searchable) {
      return this.#input;
    }

    return this.#box;
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
    // When the options changed, #syncOptions renders every option itself.
    const optionsChanged = changes.has("options");

    if (changes.has("selection")) {
      this.#renderSelection();
    }

    if (changes.has("selection") && !optionsChanged) {
      this.#renderSelectionChange();
    }

    if (changes.has("open")) {
      this.#renderOpen();
    }

    if (changes.has("navigation") && !optionsChanged) {
      this.#renderHighlightChange();
    }

    if (changes.has("query") || changes.has("config")) {
      this.#renderFilter(!optionsChanged);
    }

    if (changes.has("selection") || changes.has("query") || changes.has("config")) {
      this.#renderInput();
    }

    if (changes.has("config")) {
      this.#renderDisabled();
      this.#renderMultiple();
    }

    // The check mark column changes on every option.
    if (changes.has("config") && this.#renderedMultiple !== this.#state.config.multiple) {
      this.#renderAllOptions();
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
    this.#dispatch({ type: "OPTIONS_CHANGED", options: this.#collectOptions() });

    // New options may match or miss the current search.
    this.#renderFilter(false);

    // Always, even when the data didn't change: the elements may be new.
    this.#renderAllOptions();
  }

  /** Reads the option data and rebuilds the value → element map in one pass. */
  #collectOptions(): Option[] {
    const options: Option[] = [];
    const elements = new Map<string, CeOption>();

    for (const element of this.querySelectorAll("ce-option")) {
      const value = element.value;

      options.push({
        value,
        label: element.label,
        disabled: element.disabled,
        defaultSelected: element.defaultSelected,
      });

      if (!elements.has(value)) {
        elements.set(value, element);
      }
    }

    this.#elements = elements;

    return options;
  }

  // Trigger

  /** Gives the combobox role to the current trigger and takes it from the other. */
  #applyTrigger() {
    if (!this.#box || !this.#input || !this.#display) {
      return;
    }

    const searchable = this.#state.config.searchable;
    const trigger = searchable ? this.#input : this.#box;
    const other = searchable ? this.#box : this.#input;

    for (const name of TRIGGER_ATTRIBUTES) {
      other.removeAttribute(name);
    }

    other.removeAttribute("tabindex");
    other.ariaActiveDescendantElement = null;
    other.ariaLabelledByElements = null;
    other.ariaDisabled = null;

    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-controls", "listbox");
    trigger.ariaExpanded = this.#state.open ? "true" : "false";

    if (searchable) {
      this.#input.ariaAutoComplete = "list";
    }

    this.#input.hidden = !searchable;
    setState(this.internals, "searchable", searchable);

    this.#renderDisabled();
    this.#renderActiveDescendant();
    this.#renderSelection();
    this.#renderInput();
  }

  // Rendering

  #renderSelection() {
    if (!this.#display) {
      return;
    }

    const state = this.#state;
    const blank = state.selection.length === 0;

    setState(this.internals, "blank", blank);
    this.#display.title = blank ? "" : displayText(state);
    this.internals.setFormValue(this.#formValue());

    // Searchable single: the input shows the selection instead.
    this.#display.hidden = state.config.searchable && !state.config.multiple;

    // Searchable: the placeholder is the input's.
    if (blank) {
      this.#display.textContent = state.config.searchable ? "" : this.placeholder;
      return;
    }

    // One span per label, so they can be styled or replaced later. Commas
    // come from CSS.
    const spans: HTMLSpanElement[] = [];

    for (const selected of state.selection) {
      const span = document.createElement("span");
      span.part.add("selected-option");
      span.dataset.value = selected.value;
      span.textContent = selected.label ?? selected.value;
      spans.push(span);
    }

    this.#display.replaceChildren(...spans);
  }

  /**
   * Searchable: what the input shows. While searching, the typed text;
   * otherwise single shows the selected label, multiple stays empty (the
   * labels are in the spans before it).
   */
  #renderInput() {
    const input = this.#input;
    const state = this.#state;

    if (!input || !state.config.searchable) {
      return;
    }

    input.placeholder = state.selection.length === 0 ? this.placeholder : "";

    let text = state.query ?? "";

    if (state.query === null && !state.config.multiple) {
      text = displayText(state);
    }

    // Skip no-op writes so the caret doesn't jump while typing.
    if (input.value !== text) {
      input.value = text;
    }
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
    const trigger = this.#trigger;

    if (!trigger || !this.#listbox) {
      return;
    }

    const open = this.#state.open;

    trigger.ariaExpanded = open ? "true" : "false";
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

  /** Gives every option element its view. O(n): only when options or the mode change. */
  #renderAllOptions() {
    for (const element of this.querySelectorAll("ce-option")) {
      // Later duplicates of a value can't be selected or highlighted.
      if (this.#elements.get(element.value) !== element) {
        element.setView(this.#plainView());
        continue;
      }

      element.setView(this.#viewFor(element.value));
    }

    this.#renderedHighlight = this.#state.navigation.highlighted;
    this.#renderedSelection = new Set(formValues(this.#state));
    this.#renderedMultiple = this.#state.config.multiple;

    this.#renderActiveDescendant();
  }

  /** Updates only the previously and newly highlighted options. */
  #renderHighlightChange() {
    const previous = this.#renderedHighlight;
    const next = this.#state.navigation.highlighted;

    this.#renderedHighlight = next;

    this.#renderOption(previous);
    this.#renderOption(next);
    this.#renderActiveDescendant();
  }

  /** Updates only the options that were selected or deselected. */
  #renderSelectionChange() {
    const previous = this.#renderedSelection;
    const next = new Set(formValues(this.#state));

    this.#renderedSelection = next;

    for (const value of previous) {
      if (!next.has(value)) {
        this.#renderOption(value);
      }
    }

    for (const value of next) {
      if (!previous.has(value)) {
        this.#renderOption(value);
      }
    }
  }

  /**
   * Hides options that don't match the search, the no-results row and the
   * announcement.
   * @param updateOptions Update the options whose visibility changed. Off
   *   when a full render follows anyway.
   */
  #renderFilter(updateOptions: boolean) {
    const visible = visibleOptions(this.#state);
    const previous = this.#renderedHidden;
    const hidden = new Set<string>();

    // Only a search hides anything; skip the pass otherwise.
    if (visible.length !== this.#state.options.length) {
      const shown = new Set<string>();

      for (const option of visible) {
        shown.add(option.value);
      }

      for (const option of this.#state.options) {
        if (!shown.has(option.value)) {
          hidden.add(option.value);
        }
      }
    }

    this.#renderedHidden = hidden;

    if (updateOptions) {
      for (const value of previous) {
        if (!hidden.has(value)) {
          this.#renderOption(value);
        }
      }

      for (const value of hidden) {
        if (!previous.has(value)) {
          this.#renderOption(value);
        }
      }
    }

    const searching = this.#state.query !== null && this.#state.query !== "";

    if (this.#noResults) {
      this.#noResults.hidden = !searching || visible.length > 0;
    }

    this.#scheduleAnnouncement(searching ? visible.length : null);
  }

  /** Announces the result count once typing pauses, not on every keystroke. */
  #scheduleAnnouncement(count: number | null) {
    clearTimeout(this.#announceTimer);

    if (count === null) {
      return;
    }

    this.#announceTimer = setTimeout(() => {
      if (!this.#liveRegion) {
        return;
      }

      this.#liveRegion.textContent = resultsText(count);
    }, ANNOUNCE_DELAY);
  }

  #renderOption(value: string | null) {
    if (value === null) {
      return;
    }

    const element = this.#elements.get(value);

    if (!element) {
      return;
    }

    element.setView(this.#viewFor(value));
  }

  #viewFor(value: string): OptionView {
    return {
      selected: isSelected(this.#state, value),
      highlighted: this.#state.navigation.highlighted === value,
      filteredOut: this.#renderedHidden.has(value),
      showCheck: this.#state.config.multiple,
    };
  }

  #plainView(): OptionView {
    return {
      selected: false,
      highlighted: false,
      filteredOut: false,
      showCheck: this.#state.config.multiple,
    };
  }

  #renderActiveDescendant() {
    const trigger = this.#trigger;

    if (!trigger || !this.#listbox) {
      return;
    }

    const value = this.#state.navigation.highlighted;
    const element = value === null ? null : (this.#elements.get(value) ?? null);

    trigger.ariaActiveDescendantElement = element;

    if (!element) {
      return;
    }

    this.#scheduleScroll();
  }

  /**
   * Scrolls the highlighted option into view on the next animation frame.
   * Measuring positions right away would force style and layout in the
   * middle of handling a key; in the frame the browser does them anyway.
   * Several highlight changes before the frame scroll once.
   */
  #scheduleScroll() {
    cancelAnimationFrame(this.#scrollFrame);

    this.#scrollFrame = requestAnimationFrame(() => {
      const value = this.#state.navigation.highlighted;
      const element = value === null ? null : this.#elements.get(value);

      if (!element || !this.#listbox) {
        return;
      }

      scrollIntoList(this.#listbox, element);
    });
  }

  #renderDisabled() {
    if (!this.#box || !this.#input) {
      return;
    }

    const disabled = this.#state.config.disabled;
    const searchable = this.#state.config.searchable;

    this.#input.disabled = disabled;

    const trigger = searchable ? this.#input : this.#box;

    trigger.ariaDisabled = disabled ? "true" : null;

    // The input is focusable by itself. The box: no tabindex at all when
    // disabled, not -1, because with delegatesFocus pressing anywhere in the
    // component would still focus a tabindex="-1" box.
    if (searchable || disabled) {
      this.#box.removeAttribute("tabindex");
      return;
    }

    this.#box.tabIndex = 0;
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
    const trigger = this.#trigger;

    if (!this.shadowRoot || !trigger || !this.#listbox) {
      return;
    }

    updateFieldLabel(this, this.shadowRoot, trigger);

    // The listbox is named by the same label.
    this.#listbox.ariaLabelledByElements = trigger.ariaLabelledByElements;
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

    if (!this.#state.open) {
      this.#onClosedKeydown(event);
      return;
    }

    this.#onOpenKeydown(event);
  };

  #onClosedKeydown(event: KeyboardEvent) {
    const key = event.key;
    const searchable = this.#state.config.searchable;

    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      this.#dispatch({ type: "OPEN" });
      return;
    }

    // Searchable: a text input, so Enter submits the form like a native one.
    if (key === "Enter" && searchable) {
      submitImplicitly(this);
      return;
    }

    // Searchable: Space, Home, End and characters edit the text instead.
    if (searchable) {
      return;
    }

    if (key === "Enter" || key === " ") {
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
    const multiple = this.#state.config.multiple;
    const searchable = this.#state.config.searchable;

    if (key === "Escape") {
      // Close only the popup, not a surrounding dialog.
      event.preventDefault();
      event.stopPropagation();
      this.#dispatch({ type: "CLOSE" });
      return;
    }

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

    // Searchable: Home and End move the caret, Space types.
    if (searchable && (key === "Home" || key === "End" || key === " ")) {
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

    // Searchable: characters go into the input.
    if (isPrintable(event) && !searchable) {
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

  // Search input

  #onSearchInput = (event: Event) => {
    // Our `input` event means "the value changed"; typing isn't that.
    event.stopPropagation();

    if (!this.#input) {
      return;
    }

    const query = this.#input.value;

    this.#dispatch({ type: "QUERY", text: query });

    const detail: SearchEventDetail = { query };

    this.dispatchEvent(new CustomEvent("search", { bubbles: true, composed: true, detail }));
  };

  // Typing replaces the shown label instead of appending to it.
  #onInputFocus = () => {
    this.#input?.select();
  };

  // Mouse

  #onBoxMousedown = (event: MouseEvent) => {
    if (event.button !== 0 || this.#state.config.disabled) {
      return;
    }

    // Searchable: pressing the input places the caret as usual and opens.
    if (this.#state.config.searchable && event.target === this.#input) {
      this.#dispatch({ type: "OPEN" });
      return;
    }

    // Keep focus on the trigger and avoid selecting text.
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

    // Searchable: leaving with the text erased clears the selection.
    this.#dispatch({ type: "BLUR" }, true);
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

function resultsText(count: number): string {
  if (count === 0) {
    return "No results";
  }

  if (count === 1) {
    return "1 result";
  }

  return `${count} results`;
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

  interface HTMLElementEventMap {
    search: CustomEvent<SearchEventDetail>;
  }
}

defineElement("ce-select", CeSelect);
