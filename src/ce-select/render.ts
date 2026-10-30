// ce-select's shadow DOM and everything that writes to it. The component
// calls these with its context; they read the state and update the DOM.

import "../ce-icon/ce-icon.ts";
import { requireElement, setState } from "../core/dom.ts";
import { labelMarkup, labelStyles, updateFieldLabel } from "../core/field-label.ts";
import type { CeOption, OptionView } from "./ce-option.ts";
import type { CeSelect } from "./ce-select.ts";
import * as logic from "./logic.ts";
import type { Option, State } from "./logic.ts";

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

/** How long typing has to pause before the result count is announced. */
const ANNOUNCE_DELAY = 300;

/** Attributes the combobox role needs, moved between the two triggers. */
const TRIGGER_ATTRIBUTES = ["role", "aria-haspopup", "aria-controls", "aria-expanded"];

export type SelectRefs = {
  /** The trigger box: anchor for the popup, and the combobox when not searchable. */
  box: HTMLElement;
  display: HTMLElement;
  /** The combobox when searchable. */
  input: HTMLInputElement;
  listbox: HTMLElement;
  noResults: HTMLElement;
  liveRegion: HTMLElement;
};

/** What the option elements currently show, so a change only touches the options it affects. */
export type RenderedOptions = {
  highlight: string | null;
  selection: Set<string>;
  /** Values hidden by the search filter. */
  hidden: Set<string>;
  multiple: boolean;
};

export type SelectContext = {
  host: CeSelect;
  root: ShadowRoot;
  internals: ElementInternals;
  state: State;
  refs: SelectRefs;
  /** Option elements by value; the first one for duplicate values. */
  elements: Map<string, CeOption>;
  rendered: RenderedOptions;
  /** Pending scroll to the highlighted option, see `activeDescendant`. */
  scrollFrame: number;
  /** Pending result-count announcement, see `filter`. */
  announceTimer: ReturnType<typeof setTimeout> | undefined;
};

/** Attaches the shadow DOM and creates the context. Call once. */
export function createContext(
  host: CeSelect,
  internals: ElementInternals,
  state: State,
): SelectContext {
  const root = host.attachShadow({ mode: "open", delegatesFocus: true });
  root.append(template.content.cloneNode(true));

  return {
    host,
    root,
    internals,
    state,
    refs: collectRefs(root),
    elements: new Map(),
    rendered: {
      highlight: null,
      selection: new Set(),
      hidden: new Set(),
      multiple: false,
    },
    scrollFrame: 0,
    announceTimer: undefined,
  };
}

export function collectRefs(root: ShadowRoot): SelectRefs {
  return {
    box: requireElement(root, "[part='base']", HTMLElement),
    display: requireElement(root, "[part='display']", HTMLElement),
    input: requireElement(root, "[part='input']", HTMLInputElement),
    listbox: requireElement(root, "[part='listbox']", HTMLElement),
    noResults: requireElement(root, "[part='no-results']", HTMLElement),
    liveRegion: requireElement(root, "[aria-live]", HTMLElement),
  };
}

/** The focusable combobox element: the input when searchable, otherwise the box. */
export function trigger(context: SelectContext): HTMLElement {
  if (context.state.config.searchable) {
    return context.refs.input;
  }

  return context.refs.box;
}

/**
 * Reads the option data from the `ce-option` children and rebuilds the
 * value → element map in one pass.
 */
export function collectOptions(context: SelectContext): Option[] {
  const options: Option[] = [];
  const elements = new Map<string, CeOption>();

  for (const element of context.host.querySelectorAll("ce-option")) {
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

  context.elements = elements;

  return options;
}

/** The selected labels as spans (the placeholder when empty), the title and the form value. */
export function selection(context: SelectContext): void {
  const { host, state, refs, internals } = context;
  const isBlank = !logic.hasSelection(state);

  setState(internals, "blank", isBlank);
  refs.display.title = logic.displayText(state);
  internals.setFormValue(logic.formValue(state, host.name));

  // Searchable single: the input shows the selection instead.
  refs.display.hidden = state.config.searchable && !state.config.multiple;

  // Searchable: the placeholder is the input's.
  if (isBlank) {
    refs.display.textContent = state.config.searchable ? "" : host.placeholder;
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

  refs.display.replaceChildren(...spans);
}

/**
 * Searchable: what the input shows. While searching, the typed text;
 * otherwise single shows the selected label, multiple stays empty (the
 * labels are in the spans before it).
 */
export function input(context: SelectContext): void {
  const { host, state, refs } = context;

  if (!state.config.searchable) {
    return;
  }

  refs.input.placeholder = logic.hasSelection(state) ? "" : host.placeholder;

  let text = state.query ?? "";

  if (state.query === null && !state.config.multiple) {
    text = logic.displayText(state);
  }

  // Skip no-op writes so the caret doesn't jump while typing.
  if (refs.input.value !== text) {
    refs.input.value = text;
  }
}

/** The popup, `aria-expanded` and the `open` state. */
export function open(context: SelectContext): void {
  const { state, refs, internals } = context;
  const isOpen = state.open;

  trigger(context).ariaExpanded = isOpen ? "true" : "false";
  setState(internals, "open", isOpen);

  if (isOpen && !refs.listbox.matches(":popover-open")) {
    refs.listbox.showPopover();
    return;
  }

  if (!isOpen && refs.listbox.matches(":popover-open")) {
    refs.listbox.hidePopover();
  }
}

/** Gives every option element its view. O(n): only when options or the mode change. */
export function allOptions(context: SelectContext): void {
  const { host, state, elements, rendered } = context;

  for (const element of host.querySelectorAll("ce-option")) {
    // Later duplicates of a value can't be selected or highlighted.
    if (elements.get(element.value) !== element) {
      element.setView({
        selected: false,
        highlighted: false,
        filteredOut: false,
        showCheck: state.config.multiple,
      });
      continue;
    }

    element.setView(optionView(context, element.value));
  }

  rendered.highlight = state.navigation.highlighted;
  rendered.selection = new Set(logic.formValues(state));
  rendered.multiple = state.config.multiple;

  activeDescendant(context);
}

/** Updates only the previously and newly highlighted options. */
export function highlightChange(context: SelectContext): void {
  const previous = context.rendered.highlight;

  context.rendered.highlight = context.state.navigation.highlighted;

  option(context, previous);
  option(context, context.rendered.highlight);
  activeDescendant(context);
}

/** Updates only the options that were selected or deselected. */
export function selectionChange(context: SelectContext): void {
  const previous = context.rendered.selection;
  const next = new Set(logic.formValues(context.state));

  context.rendered.selection = next;

  for (const value of previous) {
    if (!next.has(value)) {
      option(context, value);
    }
  }

  for (const value of next) {
    if (!previous.has(value)) {
      option(context, value);
    }
  }
}

/**
 * Hides options that don't match the search, the no-results row and the
 * announcement.
 * @param shouldUpdateOptions Update the options whose visibility changed.
 *   Off when every option gets re-rendered anyway.
 */
export function filter(context: SelectContext, shouldUpdateOptions: boolean): void {
  const { state, refs, rendered } = context;
  const visible = logic.visibleOptions(state);
  const previous = rendered.hidden;
  const hidden = new Set<string>();

  // Only a search hides anything; skip the pass otherwise.
  if (visible.length !== state.options.length) {
    const shown = new Set<string>();

    for (const visibleOption of visible) {
      shown.add(visibleOption.value);
    }

    for (const stateOption of state.options) {
      if (!shown.has(stateOption.value)) {
        hidden.add(stateOption.value);
      }
    }
  }

  rendered.hidden = hidden;

  if (shouldUpdateOptions) {
    for (const value of previous) {
      if (!hidden.has(value)) {
        option(context, value);
      }
    }

    for (const value of hidden) {
      if (!previous.has(value)) {
        option(context, value);
      }
    }
  }

  const isSearching = state.query !== null && state.query !== "";

  refs.noResults.hidden = !isSearching || visible.length > 0;

  // Announce the result count once typing pauses, not on every keystroke.
  clearTimeout(context.announceTimer);

  if (!isSearching) {
    return;
  }

  context.announceTimer = setTimeout(() => {
    refs.liveRegion.textContent = resultsText(visible.length);
  }, ANNOUNCE_DELAY);
}

/**
 * Points the combobox at the highlighted option and scrolls it into view on
 * the next animation frame: measuring positions right away would force
 * style and layout in the middle of handling a key. Several highlight
 * changes before the frame scroll once.
 */
export function activeDescendant(context: SelectContext): void {
  const value = context.state.navigation.highlighted;
  const element = value === null ? null : (context.elements.get(value) ?? null);

  trigger(context).ariaActiveDescendantElement = element;

  if (!element) {
    return;
  }

  cancelAnimationFrame(context.scrollFrame);

  context.scrollFrame = requestAnimationFrame(() => {
    const highlighted = context.state.navigation.highlighted;
    const target = highlighted === null ? null : context.elements.get(highlighted);

    if (!target) {
      return;
    }

    scrollIntoList(context.refs.listbox, target);
  });
}

export function disabled(context: SelectContext): void {
  const { state, refs } = context;
  const isDisabled = state.config.disabled;

  refs.input.disabled = isDisabled;
  trigger(context).ariaDisabled = isDisabled ? "true" : null;

  // The input is focusable by itself. The box: no tabindex at all when
  // disabled, not -1, because with delegatesFocus pressing anywhere in the
  // component would still focus a tabindex="-1" box.
  if (state.config.searchable || isDisabled) {
    refs.box.removeAttribute("tabindex");
    return;
  }

  refs.box.tabIndex = 0;
}

export function multiple(context: SelectContext): void {
  context.refs.listbox.ariaMultiSelectable = context.state.config.multiple ? "true" : null;
}

/** Gives the combobox role to the current trigger and takes it from the other. */
export function triggerRole(context: SelectContext): void {
  const { state, refs, internals } = context;
  const isSearchable = state.config.searchable;
  const current = trigger(context);
  const other = isSearchable ? refs.box : refs.input;

  for (const name of TRIGGER_ATTRIBUTES) {
    other.removeAttribute(name);
  }

  other.removeAttribute("tabindex");
  other.ariaActiveDescendantElement = null;
  other.ariaLabelledByElements = null;
  other.ariaDisabled = null;

  current.setAttribute("role", "combobox");
  current.setAttribute("aria-haspopup", "listbox");
  current.setAttribute("aria-controls", "listbox");
  current.ariaExpanded = state.open ? "true" : "false";

  if (isSearchable) {
    refs.input.ariaAutoComplete = "list";
  }

  refs.input.hidden = !isSearchable;
  setState(internals, "searchable", isSearchable);
}

/** Names the combobox and the listbox by the label. */
export function label(context: SelectContext): void {
  const current = trigger(context);

  updateFieldLabel(context.host, context.root, current);
  context.refs.listbox.ariaLabelledByElements = current.ariaLabelledByElements;
}

function option(context: SelectContext, value: string | null): void {
  if (value === null) {
    return;
  }

  const element = context.elements.get(value);

  if (!element) {
    return;
  }

  element.setView(optionView(context, value));
}

function optionView(context: SelectContext, value: string): OptionView {
  const { state, rendered } = context;

  return {
    selected: logic.isSelected(state, value),
    highlighted: state.navigation.highlighted === value,
    filteredOut: rendered.hidden.has(value),
    showCheck: state.config.multiple,
  };
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
