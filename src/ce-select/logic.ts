// What ce-select knows and how it changes. No DOM, no timers, no events.
//
// Each function changes `state` in place and returns the fields that
// changed (empty when nothing did). Functions that build on others pass
// their `changes` along, so one call reports everything it touched.

import * as navigation from "../core/list-navigation.ts";
import type { HighlightTarget, ListNavigation } from "../core/list-navigation.ts";

export type Option = {
  value: string;
  label: string;
  disabled: boolean;
  /** Marked `selected` in markup, like native `<option selected>`. */
  defaultSelected: boolean;
};

export type Selected = {
  value: string;
  /** Null until an option with this value is seen. */
  label: string | null;
};

export type Config = {
  multiple: boolean;
  searchable: boolean;
  /** Filter options by the query. Off when the app filters (e.g. server results). */
  filter: boolean;
  /** Effective disabled state (attribute or disabled fieldset). */
  disabled: boolean;
};

export type State = {
  options: Option[];
  selection: Selected[];
  dirty: boolean;
  open: boolean;
  /** Highlight and keyboard movement. Its items are always the visible options. */
  navigation: ListNavigation;
  /** Null while not typing; the input shows the selection. */
  query: string | null;
  config: Config;
};

export type Field = keyof State;

export type Changes = Set<Field>;

/** The parts of a `KeyboardEvent` the logic looks at. */
export type KeyInput = Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey">;

/** Anything identified by a value: options and selected entries. */
type WithValue = {
  value: string;
};

export function createState(config: Partial<Config> = {}): State {
  return {
    options: [],
    selection: [],
    dirty: false,
    open: false,
    navigation: navigation.createListNavigation(),
    query: null,
    config: {
      multiple: false,
      searchable: false,
      filter: true,
      disabled: false,
      ...config,
    },
  };
}

// Changing the state

/**
 * New options from the DOM. Duplicate values: the first one wins. While
 * clean, the selection follows options marked `selected`; once dirty it's
 * kept, with labels refreshed from matching options.
 */
export function setOptions(state: State, options: Option[], changes: Changes = new Set()): Changes {
  const unique: Option[] = [];
  const seen = new Set<string>();

  for (const option of options) {
    if (seen.has(option.value)) {
      continue;
    }

    seen.add(option.value);
    unique.push(option);
  }

  set(state, changes, "options", unique);

  if (!state.dirty) {
    set(state, changes, "selection", defaultSelection(state.options, state.config.multiple));
    syncNavigation(state, changes);
    return changes;
  }

  // Values without an option keep their stored label.
  const selection: Selected[] = [];

  for (const selected of state.selection) {
    const option = findOption(state.options, selected.value);

    if (!option) {
      selection.push(selected);
      continue;
    }

    selection.push({ value: selected.value, label: option.label });
  }

  set(state, changes, "selection", selection);
  syncNavigation(state, changes);

  return changes;
}

/** Programmatic value (`value` / `values` setters, form state restore). */
export function setValues(state: State, values: string[], changes: Changes = new Set()): Changes {
  const selection: Selected[] = [];

  for (const value of values) {
    if (findSelected(selection, value)) {
      continue;
    }

    if (!state.config.multiple && selection.length === 1) {
      break;
    }

    // Prefer the option's label, then a label stored earlier, then none.
    const option = findOption(state.options, value);
    const stored = findSelected(state.selection, value);
    const label = option?.label ?? stored?.label ?? null;

    selection.push({ value, label });
  }

  set(state, changes, "selection", selection);
  set(state, changes, "dirty", true);

  return changes;
}

/** User picks an option in single mode, which closes the list. */
export function selectOption(state: State, value: string, changes: Changes = new Set()): Changes {
  if (state.config.disabled || state.config.multiple) {
    return changes;
  }

  const option = findOption(state.options, value);

  if (!option || option.disabled) {
    return changes;
  }

  set(state, changes, "selection", [{ value: option.value, label: option.label }]);
  set(state, changes, "dirty", true);
  closeList(state, changes);

  return changes;
}

/** User toggles an option in multiple mode. The list stays open. */
export function toggleOption(state: State, value: string, changes: Changes = new Set()): Changes {
  if (state.config.disabled || !state.config.multiple) {
    return changes;
  }

  const option = findOption(state.options, value);

  if (!option || option.disabled) {
    return changes;
  }

  set(state, changes, "dirty", true);

  if (!findSelected(state.selection, value)) {
    set(state, changes, "selection", [
      ...state.selection,
      { value: option.value, label: option.label },
    ]);
    return changes;
  }

  const selection: Selected[] = [];

  for (const selected of state.selection) {
    if (selected.value === value) {
      continue;
    }

    selection.push(selected);
  }

  set(state, changes, "selection", selection);

  return changes;
}

/** The highlighted option: selected (single) or toggled (multiple). */
export function selectHighlighted(state: State, changes: Changes = new Set()): Changes {
  const highlighted = state.navigation.highlighted;

  if (highlighted === null) {
    return changes;
  }

  if (state.config.multiple) {
    return toggleOption(state, highlighted, changes);
  }

  return selectOption(state, highlighted, changes);
}

export function clearSelection(state: State, changes: Changes = new Set()): Changes {
  if (state.config.disabled) {
    return changes;
  }

  set(state, changes, "selection", []);
  set(state, changes, "dirty", true);
  set(state, changes, "query", null);
  syncNavigation(state, changes);

  return changes;
}

/**
 * Highlights the given end, else the first selected option that can be
 * highlighted, else the first enabled one.
 */
export function openList(
  state: State,
  at?: "first" | "last",
  changes: Changes = new Set(),
): Changes {
  if (state.config.disabled || state.open) {
    return changes;
  }

  set(state, changes, "open", true);
  set(state, changes, "query", null);
  syncNavigation(state, changes);

  if (at) {
    track(changes, navigation.moveHighlight(state.navigation, at));
    return changes;
  }

  const candidates = enabledVisibleOptions(state);
  const selected = state.selection.find((item) => findOption(candidates, item.value));

  if (selected) {
    track(changes, navigation.highlightValue(state.navigation, selected.value));
    return changes;
  }

  track(changes, navigation.moveHighlight(state.navigation, "first"));

  return changes;
}

export function closeList(state: State, changes: Changes = new Set()): Changes {
  set(state, changes, "open", false);
  set(state, changes, "query", null);
  syncNavigation(state, changes);
  track(changes, navigation.clearHighlight(state.navigation));

  return changes;
}

/**
 * Keyboard movement. Closed: only opens, without moving the highlight (APG
 * select-only combobox); Home / End open at that end.
 */
export function moveHighlight(
  state: State,
  to: HighlightTarget,
  changes: Changes = new Set(),
): Changes {
  if (state.config.disabled) {
    return changes;
  }

  if (!state.open && (to === "first" || to === "last")) {
    return openList(state, to, changes);
  }

  if (!state.open) {
    return openList(state, undefined, changes);
  }

  track(changes, navigation.moveHighlight(state.navigation, to));

  return changes;
}

/** Hover. Ignored while closed. */
export function highlightOption(
  state: State,
  value: string,
  changes: Changes = new Set(),
): Changes {
  if (state.config.disabled || !state.open) {
    return changes;
  }

  track(changes, navigation.highlightValue(state.navigation, value));

  return changes;
}

/** Plain mode only. `text` is the component's buffered keystrokes. */
export function typeahead(state: State, text: string, changes: Changes = new Set()): Changes {
  if (state.config.disabled || state.config.searchable || text === "") {
    return changes;
  }

  const wasOpen = state.open;

  openList(state, undefined, changes);

  // Opening highlights the selected option, so the search continues after
  // it. With nothing selected that highlight is only a default: search from
  // the top, so "n" finds the first "N…" option rather than the second.
  if (wasOpen || state.selection.length > 0) {
    track(changes, navigation.typeahead(state.navigation, text));
    return changes;
  }

  const fallback = state.navigation.highlighted;

  track(changes, navigation.clearHighlight(state.navigation));

  if (navigation.typeahead(state.navigation, text)) {
    track(changes, true);
    return changes;
  }

  // No match: keep the default highlight.
  if (fallback !== null) {
    track(changes, navigation.highlightValue(state.navigation, fallback));
  }

  return changes;
}

/** Searchable only: the user typed in the input. */
export function search(state: State, text: string, changes: Changes = new Set()): Changes {
  if (state.config.disabled || !state.config.searchable) {
    return changes;
  }

  set(state, changes, "open", true);
  set(state, changes, "query", text);
  syncNavigation(state, changes);
  track(changes, navigation.moveHighlight(state.navigation, "first"));

  return changes;
}

/** Focus left the component. */
export function blur(state: State, changes: Changes = new Set()): Changes {
  // Searchable single: erasing the text and leaving clears the selection.
  // Any other typed text is dropped, so the input shows the selection again.
  const shouldClear =
    state.config.searchable &&
    !state.config.multiple &&
    state.query === "" &&
    !state.config.disabled;

  if (shouldClear) {
    set(state, changes, "selection", []);
    set(state, changes, "dirty", true);
  }

  return closeList(state, changes);
}

export function setConfig(
  state: State,
  config: Partial<Config>,
  changes: Changes = new Set(),
): Changes {
  const before = state.config;

  set(state, changes, "config", { ...before, ...config });

  if (!state.config.multiple && state.selection.length > 1) {
    set(state, changes, "selection", state.selection.slice(0, 1));
  }

  if (state.config.searchable !== before.searchable || state.config.filter !== before.filter) {
    set(state, changes, "query", null);
  }

  // A changed filter changes the visible options; an invalid highlight
  // moves to the first enabled one.
  syncNavigation(state, changes);

  if (state.config.disabled) {
    closeList(state, changes);
  }

  return changes;
}

/** Form reset: back to options marked `selected`, or empty. */
export function reset(state: State, changes: Changes = new Set()): Changes {
  set(state, changes, "selection", defaultSelection(state.options, state.config.multiple));
  set(state, changes, "dirty", false);

  return closeList(state, changes);
}

// Reading the state

/**
 * Options matching the query. All options unless searchable, filtering and
 * the user typed something.
 */
export function visibleOptions(state: State): Option[] {
  const text = state.query;

  if (!state.config.searchable || !state.config.filter || text === null || text === "") {
    return state.options;
  }

  const needle = text.toLowerCase();
  const result: Option[] = [];

  for (const option of state.options) {
    if (!option.label.toLowerCase().includes(needle)) {
      continue;
    }

    result.push(option);
  }

  return result;
}

/** Selected labels, comma-separated. Values without a known label show as is. */
export function displayText(state: State): string {
  const labels: string[] = [];

  for (const selected of state.selection) {
    labels.push(selected.label ?? selected.value);
  }

  return labels.join(", ");
}

/** Selected values, in selection order. */
export function formValues(state: State): string[] {
  const values: string[] = [];

  for (const selected of state.selection) {
    values.push(selected.value);
  }

  return values;
}

/** Single: the value. Multiple: one `name=value` entry per value (none without a name). */
export function formValue(state: State, name: string): string | FormData | null {
  const values = formValues(state);

  if (values.length === 0) {
    return null;
  }

  if (!state.config.multiple) {
    return values[0] ?? null;
  }

  if (name === "") {
    return null;
  }

  const data = new FormData();

  for (const value of values) {
    data.append(name, value);
  }

  return data;
}

export function isSelected(state: State, value: string): boolean {
  return findSelected(state.selection, value) !== null;
}

export function hasSelection(state: State): boolean {
  return state.selection.length > 0;
}

/** A searchable select is a text input: closed, Enter submits the form like a native one. */
export function shouldSubmitOnEnter(state: State, key: KeyInput): boolean {
  return key.key === "Enter" && state.config.searchable && !state.open;
}

/** A key that types a character (type-ahead or search). */
export function isPrintable(key: KeyInput): boolean {
  return key.key.length === 1 && !key.ctrlKey && !key.metaKey && !key.altKey;
}

/** Keys that change the search text. */
export function isEditingKey(key: KeyInput): boolean {
  return isPrintable(key) || key.key === "Backspace" || key.key === "Delete";
}

/** Throws if the state breaks a rule from the plan. Used by tests. */
export function checkInvariants(state: State): void {
  if (!state.config.multiple && state.selection.length > 1) {
    throw new Error("Single mode has more than one selected value");
  }

  if (hasDuplicateValues(state.selection)) {
    throw new Error("Selection has duplicate values");
  }

  if (hasDuplicateValues(state.options)) {
    throw new Error("Options have duplicate values");
  }

  if (!isEqual(state.navigation.items, visibleOptions(state))) {
    throw new Error("Navigation items aren't the visible options");
  }

  const highlighted = state.navigation.highlighted;
  const candidates = enabledVisibleOptions(state);

  if (highlighted !== null && !findOption(candidates, highlighted)) {
    throw new Error(`Highlighted "${highlighted}" isn't a visible, enabled option`);
  }

  if (!state.open && (highlighted !== null || state.query !== null)) {
    throw new Error("Closed with a highlight or query");
  }

  if (state.config.disabled && state.open) {
    throw new Error("Disabled but open");
  }

  if (!state.config.searchable && state.query !== null) {
    throw new Error("Query without searchable");
  }
}

// Helpers

/**
 * The only way fields are written: records the field only if the value
 * actually differs.
 */
function set<K extends Field>(state: State, changes: Changes, field: K, value: State[K]): void {
  if (isEqual(state[field], value)) {
    return;
  }

  state[field] = value;
  changes.add(field);
}

/** Records a change reported by a list-navigation helper. */
function track(changes: Changes, changed: boolean): void {
  if (!changed) {
    return;
  }

  changes.add("navigation");
}

/** Keeps the navigation items equal to the visible options. */
function syncNavigation(state: State, changes: Changes): void {
  track(changes, navigation.setItems(state.navigation, visibleOptions(state)));
}

/** Options marked `selected`. Single mode: the last one, like native. */
function defaultSelection(options: Option[], multiple: boolean): Selected[] {
  let selection: Selected[] = [];

  for (const option of options) {
    if (!option.defaultSelected) {
      continue;
    }

    const selected = { value: option.value, label: option.label };

    if (multiple) {
      selection.push(selected);
      continue;
    }

    selection = [selected];
  }

  return selection;
}

function enabledVisibleOptions(state: State): Option[] {
  const result: Option[] = [];

  for (const option of visibleOptions(state)) {
    if (option.disabled) {
      continue;
    }

    result.push(option);
  }

  return result;
}

function findOption(options: Option[], value: string | null): Option | null {
  return options.find((option) => option.value === value) ?? null;
}

function findSelected(selection: Selected[], value: string): Selected | null {
  return selection.find((selected) => selected.value === value) ?? null;
}

function hasDuplicateValues(items: WithValue[]): boolean {
  const seen = new Set<string>();

  for (const item of items) {
    if (seen.has(item.value)) {
      return true;
    }

    seen.add(item.value);
  }

  return false;
}

/** Structural equality for state: primitives, arrays and plain objects. */
function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }

    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) {
        return false;
      }
    }

    return true;
  }

  // An array and a non-array, or different primitives.
  if (Array.isArray(a) || Array.isArray(b)) {
    return false;
  }

  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);

  if (keys.length !== Object.keys(right).length) {
    return false;
  }

  for (const key of keys) {
    if (!isEqual(left[key], right[key])) {
      return false;
    }
  }

  return true;
}
