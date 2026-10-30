// Keyboard navigation over a flat list (listbox options, menu items, tabs).
//
// The component owns a `ListNavigation` and only changes it through these
// functions. Each one changes the state in place and returns whether
// anything changed, so the component knows when to update the DOM.

export type NavigationItem = {
  value: string;
  label: string;
  disabled: boolean;
};

export type HighlightTarget = "next" | "prev" | "first" | "last" | "pageNext" | "pagePrev";

export type ListNavigation = {
  /** The items the user can currently move through, in order. */
  items: NavigationItem[];
  /** Value of the highlighted item. Always an enabled item, or null. */
  highlighted: string | null;
  /** `next` on the last item goes to the first, and `prev` on the first to the last. */
  wrap: boolean;
  /** Items moved by `pageNext` / `pagePrev`. */
  pageSize: number;
};

export type ListNavigationOptions = Partial<Pick<ListNavigation, "wrap" | "pageSize">>;

export type Orientation = "vertical" | "horizontal";

export type TextDirection = "ltr" | "rtl";

/** The parts of a `KeyboardEvent` that `navigationKey` reads. */
export type NavigationKeyEvent = Pick<
  KeyboardEvent,
  "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey"
>;

export type TypeaheadBuffer = {
  text: string;
  /** Time of the last key, in milliseconds (e.g. `event.timeStamp`). */
  time: number;
  /** Keys further apart than this start a new search. */
  timeout: number;
};

export function createListNavigation(options: ListNavigationOptions = {}): ListNavigation {
  return {
    items: [],
    highlighted: null,
    wrap: options.wrap ?? true,
    pageSize: options.pageSize ?? 10,
  };
}

/**
 * Replaces the items. The highlight is kept if it's still enabled; otherwise
 * it moves to the nearest enabled item after its old position, then before
 * it, or null.
 */
export function setItems(nav: ListNavigation, items: NavigationItem[]): boolean {
  const oldItems = nav.items;
  const oldHighlighted = nav.highlighted;
  const itemsChanged = !sameItems(oldItems, items);

  nav.items = items;

  if (oldHighlighted === null || findEnabled(nav, oldHighlighted)) {
    return itemsChanged;
  }

  const oldIndex = oldItems.findIndex((item) => item.value === oldHighlighted);

  // Later items first, then earlier ones, closest first.
  for (let i = oldIndex + 1; i < oldItems.length; i++) {
    const item = oldItems[i];

    if (item && findEnabled(nav, item.value)) {
      nav.highlighted = item.value;
      return true;
    }
  }

  for (let i = oldIndex - 1; i >= 0; i--) {
    const item = oldItems[i];

    if (item && findEnabled(nav, item.value)) {
      nav.highlighted = item.value;
      return true;
    }
  }

  nav.highlighted = null;

  return true;
}

/** Moves the highlight among enabled items. */
export function moveHighlight(nav: ListNavigation, to: HighlightTarget): boolean {
  const enabled = enabledItems(nav);

  if (enabled.length === 0) {
    return false;
  }

  const current = enabled.findIndex((item) => item.value === nav.highlighted);
  const index = targetIndex(nav, current, enabled.length, to);

  return highlight(nav, enabled[index]?.value ?? null);
}

/** Highlights an item by value (e.g. on hover). Ignores missing and disabled items. */
export function highlightValue(nav: ListNavigation, value: string): boolean {
  if (!findEnabled(nav, value)) {
    return false;
  }

  return highlight(nav, value);
}

export function clearHighlight(nav: ListNavigation): boolean {
  return highlight(nav, null);
}

/**
 * Highlights the next item whose label starts with `text`, case-insensitively.
 * A repeated single character ("aaa") cycles through items starting with it;
 * otherwise the current item is kept while it still matches.
 */
export function typeahead(nav: ListNavigation, text: string): boolean {
  if (text === "") {
    return false;
  }

  const enabled = enabledItems(nav);
  const current = enabled.findIndex((item) => item.value === nav.highlighted);

  const repeated = text === text.charAt(0).repeat(text.length);
  const search = repeated ? text.charAt(0).toLowerCase() : text.toLowerCase();
  const start = repeated ? current + 1 : Math.max(current, 0);

  for (let step = 0; step < enabled.length; step++) {
    const item = enabled[(start + step) % enabled.length];

    if (!item || !item.label.toLowerCase().startsWith(search)) {
      continue;
    }

    return highlight(nav, item.value);
  }

  return false;
}

/**
 * Maps a key to a highlight move, or null for keys that don't navigate.
 * Keys with Alt, Ctrl, Meta or Shift are left to the component (e.g.
 * Alt+ArrowDown opens a select).
 */
export function navigationKey(
  event: NavigationKeyEvent,
  orientation: Orientation,
  direction: TextDirection = "ltr",
): HighlightTarget | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return null;
  }

  switch (event.key) {
    case "Home":
      return "first";
    case "End":
      return "last";
    case "PageDown":
      return "pageNext";
    case "PageUp":
      return "pagePrev";
  }

  if (orientation === "vertical") {
    return verticalKey(event.key);
  }

  return horizontalKey(event.key, direction);
}

export function createTypeaheadBuffer(timeout = 500): TypeaheadBuffer {
  return { text: "", time: -Infinity, timeout };
}

/**
 * Adds a typed character, starting over when the previous one is older than
 * the timeout. Returns the text to search for.
 */
export function pushTypeahead(buffer: TypeaheadBuffer, char: string, time: number): string {
  if (time - buffer.time > buffer.timeout) {
    buffer.text = "";
  }

  buffer.text += char;
  buffer.time = time;

  return buffer.text;
}

// Helpers

function sameItems(a: NavigationItem[], b: NavigationItem[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];

    if (!left || !right) {
      return false;
    }

    if (
      left.value !== right.value ||
      left.label !== right.label ||
      left.disabled !== right.disabled
    ) {
      return false;
    }
  }

  return true;
}

function highlight(nav: ListNavigation, value: string | null): boolean {
  if (nav.highlighted === value) {
    return false;
  }

  nav.highlighted = value;

  return true;
}

function findEnabled(nav: ListNavigation, value: string): NavigationItem | null {
  const item = nav.items.find((candidate) => candidate.value === value);

  if (!item || item.disabled) {
    return null;
  }

  return item;
}

function enabledItems(nav: ListNavigation): NavigationItem[] {
  const result: NavigationItem[] = [];

  for (const item of nav.items) {
    if (item.disabled) {
      continue;
    }

    result.push(item);
  }

  return result;
}

/**
 * @param current Index among enabled items, -1 if nothing is highlighted.
 */
function targetIndex(
  nav: ListNavigation,
  current: number,
  length: number,
  to: HighlightTarget,
): number {
  const last = length - 1;

  switch (to) {
    case "first":
      return 0;
    case "last":
      return last;
    case "next":
      if (current === -1) {
        return 0;
      }

      if (current === last) {
        return nav.wrap ? 0 : last;
      }

      return current + 1;
    case "prev":
      if (current === -1) {
        return last;
      }

      if (current === 0) {
        return nav.wrap ? last : 0;
      }

      return current - 1;
    case "pageNext":
      return Math.min(Math.max(current, 0) + nav.pageSize, last);
    case "pagePrev":
      return Math.max(current - nav.pageSize, 0);
  }
}

function verticalKey(key: string): HighlightTarget | null {
  if (key === "ArrowDown") {
    return "next";
  }

  if (key === "ArrowUp") {
    return "prev";
  }

  return null;
}

/** In right-to-left text, ArrowLeft moves forward. */
function horizontalKey(key: string, direction: TextDirection): HighlightTarget | null {
  const forward = direction === "rtl" ? "ArrowLeft" : "ArrowRight";
  const backward = direction === "rtl" ? "ArrowRight" : "ArrowLeft";

  if (key === forward) {
    return "next";
  }

  if (key === backward) {
    return "prev";
  }

  return null;
}
