// State and reducer for ce-select. No DOM, no timers.
// See docs/ce-select-plan.md for the actions and invariants.
//
// The reducer changes the state in place for performance. It's the only code
// allowed to change it; everything else only reads.

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
  highlighted: string | null;
  /** Null while not typing; the input shows the selection. */
  query: string | null;
  config: Config;
};

export type HighlightTarget = "next" | "prev" | "first" | "last" | "pageNext" | "pagePrev";

/** Actions without a payload. */
export type PlainAction = {
  type: "SELECT_HIGHLIGHTED" | "CLEAR" | "CLOSE" | "BLUR" | "RESET";
};

export type OptionsChangedAction = {
  type: "OPTIONS_CHANGED";
  options: Option[];
};

/** Programmatic value (`value` setter, form state restore). */
export type SetValueAction = {
  type: "SET_VALUE" | "RESTORE";
  values: string[];
};

/** User picks (single) or toggles (multiple) one option. */
export type PickAction = {
  type: "SELECT" | "TOGGLE";
  value: string;
};

export type OpenAction = {
  type: "OPEN";
  highlight?: "first" | "last";
};

/** Keyboard: move the highlight. */
export type HighlightMoveAction = {
  type: "HIGHLIGHT";
  to: HighlightTarget;
  value?: undefined;
};

/** Hover: highlight a specific option. */
export type HighlightValueAction = {
  type: "HIGHLIGHT";
  value: string;
  to?: undefined;
};

export type HighlightAction = HighlightMoveAction | HighlightValueAction;

/** Type-ahead buffer (plain mode) or search text (searchable). */
export type TextAction = {
  type: "TYPEAHEAD" | "QUERY";
  text: string;
};

export type ConfigAction = {
  type: "CONFIG";
  config: Partial<Config>;
};

export type Action =
  | PlainAction
  | OptionsChangedAction
  | SetValueAction
  | PickAction
  | OpenAction
  | HighlightAction
  | TextAction
  | ConfigAction;

export type Field = keyof State;

type Changes = Set<Field>;

/** Anything identified by a value: options and selected entries. */
type WithValue = {
  value: string;
};

const PAGE_SIZE = 10;

export function createState(config: Partial<Config> = {}): State {
  return {
    options: [],
    selection: [],
    dirty: false,
    open: false,
    highlighted: null,
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

/**
 * Applies the action to `state` in place.
 * @returns Fields that changed; empty when the action was a no-op.
 */
export function reduce(state: State, action: Action): Changes {
  const changes: Changes = new Set();

  switch (action.type) {
    case "OPTIONS_CHANGED":
      optionsChanged(state, changes, action.options);
      break;
    case "SET_VALUE":
    case "RESTORE":
      setValue(state, changes, action.values);
      break;
    case "SELECT":
      select(state, changes, action.value);
      break;
    case "TOGGLE":
      toggle(state, changes, action.value);
      break;
    case "SELECT_HIGHLIGHTED":
      selectHighlighted(state, changes);
      break;
    case "CLEAR":
      clear(state, changes);
      break;
    case "OPEN":
      open(state, changes, action.highlight);
      break;
    case "CLOSE":
      close(state, changes);
      break;
    case "HIGHLIGHT":
      highlight(state, changes, action);
      break;
    case "TYPEAHEAD":
      typeahead(state, changes, action.text);
      break;
    case "QUERY":
      query(state, changes, action.text);
      break;
    case "BLUR":
      blur(state, changes);
      break;
    case "CONFIG":
      configChanged(state, changes, action.config);
      break;
    case "RESET":
      reset(state, changes);
      break;
    default:
      throw new Error(`Unknown action: ${(action as Action).type}`);
  }

  return changes;
}

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

// Actions

function optionsChanged(state: State, changes: Changes, options: Option[]): void {
  // Needed to move the highlight past a removed option.
  const oldCandidates = enabledVisibleOptions(state);

  // First option per value wins.
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

  // While clean, the selection follows options marked `selected`.
  if (!state.dirty) {
    set(state, changes, "selection", defaultSelection(state.options, state.config.multiple));
    set(state, changes, "highlighted", highlightAfterOptionsChange(state, oldCandidates));
    return;
  }

  // Once dirty, it's kept as is, only with labels refreshed from matching
  // options. Values without an option keep their stored label.
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
  set(state, changes, "highlighted", highlightAfterOptionsChange(state, oldCandidates));
}

/** Programmatic value (`value` setter, form state restore). */
function setValue(state: State, changes: Changes, values: string[]): void {
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
}

/** User picks an option in single mode. */
function select(state: State, changes: Changes, value: string): void {
  if (state.config.disabled || state.config.multiple) {
    return;
  }

  const option = findOption(state.options, value);

  if (!option || option.disabled) {
    return;
  }

  set(state, changes, "selection", [{ value: option.value, label: option.label }]);
  set(state, changes, "dirty", true);
  close(state, changes);
}

/** User toggles an option in multiple mode. The popup stays open. */
function toggle(state: State, changes: Changes, value: string): void {
  if (state.config.disabled || !state.config.multiple) {
    return;
  }

  const option = findOption(state.options, value);

  if (!option || option.disabled) {
    return;
  }

  set(state, changes, "dirty", true);

  if (!findSelected(state.selection, value)) {
    set(state, changes, "selection", [
      ...state.selection,
      { value: option.value, label: option.label },
    ]);
    return;
  }

  const selection: Selected[] = [];

  for (const selected of state.selection) {
    if (selected.value === value) {
      continue;
    }

    selection.push(selected);
  }

  set(state, changes, "selection", selection);
}

/** Enter / Space / Tab on the highlighted option. */
function selectHighlighted(state: State, changes: Changes): void {
  if (state.highlighted === null) {
    return;
  }

  if (state.config.multiple) {
    toggle(state, changes, state.highlighted);
    return;
  }

  select(state, changes, state.highlighted);
}

function clear(state: State, changes: Changes): void {
  if (state.config.disabled) {
    return;
  }

  set(state, changes, "selection", []);
  set(state, changes, "dirty", true);
  set(state, changes, "query", null);
}

/** @param at Highlight this end instead of the selection. */
function open(state: State, changes: Changes, at?: "first" | "last"): void {
  if (state.config.disabled || state.open) {
    return;
  }

  set(state, changes, "open", true);
  set(state, changes, "query", null);

  const candidates = enabledVisibleOptions(state);

  if (candidates.length === 0) {
    set(state, changes, "highlighted", null);
    return;
  }

  if (at === "first") {
    set(state, changes, "highlighted", candidates[0]?.value ?? null);
    return;
  }

  if (at === "last") {
    set(state, changes, "highlighted", candidates[candidates.length - 1]?.value ?? null);
    return;
  }

  set(state, changes, "highlighted", defaultHighlight(state));
}

function close(state: State, changes: Changes): void {
  set(state, changes, "open", false);
  set(state, changes, "highlighted", null);
  set(state, changes, "query", null);
}

/**
 * Keyboard or hover. Closed: only opens, without moving the highlight
 * (APG select-only combobox).
 */
function highlight(state: State, changes: Changes, action: HighlightAction): void {
  if (state.config.disabled) {
    return;
  }

  if (!state.open) {
    if (action.value !== undefined) {
      return;
    }

    if (action.to === "first" || action.to === "last") {
      open(state, changes, action.to);
      return;
    }

    open(state, changes);
    return;
  }

  const candidates = enabledVisibleOptions(state);

  if (action.value !== undefined) {
    if (!findOption(candidates, action.value)) {
      return;
    }

    set(state, changes, "highlighted", action.value);
    return;
  }

  if (candidates.length === 0) {
    return;
  }

  const index = candidates.findIndex((option) => option.value === state.highlighted);
  const nextIndex = moveIndex(index, candidates.length, action.to);

  set(state, changes, "highlighted", candidates[nextIndex]?.value ?? null);
}

/** Plain mode only. `text` is the component's buffered keystrokes. */
function typeahead(state: State, changes: Changes, text: string): void {
  if (state.config.disabled || state.config.searchable || text === "") {
    return;
  }

  open(state, changes);

  const candidates = enabledVisibleOptions(state);
  const current = candidates.findIndex((option) => option.value === state.highlighted);

  // "aaa" cycles through options starting with "a", one per key press.
  // Otherwise keep the current option while it still matches.
  const repeated = text === text.charAt(0).repeat(text.length);
  const search = repeated ? text.charAt(0).toLowerCase() : text.toLowerCase();
  const start = repeated ? current + 1 : Math.max(current, 0);

  for (let step = 0; step < candidates.length; step++) {
    const option = candidates[(start + step) % candidates.length];

    if (!option || !option.label.toLowerCase().startsWith(search)) {
      continue;
    }

    set(state, changes, "highlighted", option.value);
    return;
  }
}

/** Searchable only: the user typed in the input. */
function query(state: State, changes: Changes, text: string): void {
  if (state.config.disabled || !state.config.searchable) {
    return;
  }

  set(state, changes, "open", true);
  set(state, changes, "query", text);

  const candidates = enabledVisibleOptions(state);

  set(state, changes, "highlighted", candidates[0]?.value ?? null);
}

/** Focus left the component. */
function blur(state: State, changes: Changes): void {
  // Searchable single: erasing the text and leaving clears the selection.
  // Any other typed text is dropped, so the input shows the selection again.
  const clearsSelection =
    state.config.searchable &&
    !state.config.multiple &&
    state.query === "" &&
    !state.config.disabled;

  if (clearsSelection) {
    set(state, changes, "selection", []);
    set(state, changes, "dirty", true);
  }

  close(state, changes);
}

function configChanged(state: State, changes: Changes, config: Partial<Config>): void {
  const before = state.config;

  set(state, changes, "config", { ...before, ...config });

  if (!state.config.multiple && state.selection.length > 1) {
    set(state, changes, "selection", state.selection.slice(0, 1));
  }

  if (state.config.searchable !== before.searchable || state.config.filter !== before.filter) {
    set(state, changes, "query", null);
  }

  if (state.config.disabled) {
    close(state, changes);
    return;
  }

  if (!state.open) {
    return;
  }

  const candidates = enabledVisibleOptions(state);

  if (findOption(candidates, state.highlighted)) {
    return;
  }

  set(state, changes, "highlighted", defaultHighlight(state));
}

/** Form reset: back to options marked `selected`, or empty. */
function reset(state: State, changes: Changes): void {
  set(state, changes, "selection", defaultSelection(state.options, state.config.multiple));
  set(state, changes, "dirty", false);
  close(state, changes);
}

/**
 * Keeps the highlight if it's still valid, else moves to the next option
 * after its old position, else the default.
 * @param state Already has the new options.
 * @param oldCandidates Enabled visible options before the change.
 */
function highlightAfterOptionsChange(state: State, oldCandidates: Option[]): string | null {
  if (!state.open) {
    return null;
  }

  const candidates = enabledVisibleOptions(state);

  if (findOption(candidates, state.highlighted)) {
    return state.highlighted;
  }

  const oldIndex = oldCandidates.findIndex((option) => option.value === state.highlighted);

  if (oldIndex === -1) {
    return defaultHighlight(state);
  }

  const later = oldCandidates.slice(oldIndex + 1);
  const next = later.find((candidate) => findOption(candidates, candidate.value));

  if (next) {
    return next.value;
  }

  return defaultHighlight(state);
}

// Selectors

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

export function isSelected(state: State, value: string): boolean {
  return findSelected(state.selection, value) !== null;
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

  const candidates = enabledVisibleOptions(state);

  if (state.highlighted !== null && !findOption(candidates, state.highlighted)) {
    throw new Error(`Highlighted "${state.highlighted}" isn't a visible, enabled option`);
  }

  if (!state.open && (state.highlighted !== null || state.query !== null)) {
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

/** First selected option that can be highlighted, else the first enabled one. */
function defaultHighlight(state: State): string | null {
  const candidates = enabledVisibleOptions(state);

  const selected = state.selection.find((item) => findOption(candidates, item.value));

  if (selected) {
    return selected.value;
  }

  return candidates[0]?.value ?? null;
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

/** @param index Current index, -1 if none. */
function moveIndex(index: number, length: number, to: HighlightTarget | undefined): number {
  const last = length - 1;

  switch (to) {
    case "first":
      return 0;
    case "last":
      return last;
    case "next":
      return index >= last ? 0 : index + 1;
    case "prev":
      return index <= 0 ? last : index - 1;
    case "pageNext":
      return Math.min(Math.max(index, 0) + PAGE_SIZE, last);
    case "pagePrev":
      return Math.max(index - PAGE_SIZE, 0);
    default:
      throw new Error(`Unknown highlight target: ${to}`);
  }
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
