// What ce-tooltip knows and how it changes. No DOM, no timers, no events.
//
// Each function changes `state` in place and returns the fields that
// changed (empty when nothing did). Whether the tooltip should be open is
// derived (`shouldBeOpen`); the component opens or closes it after its
// delays with `setOpen`.

export type State = {
  open: boolean;
  disabled: boolean;
  triggerHovered: boolean;
  /** The pointer moved onto the tooltip itself, so it stays (WCAG 1.4.13). */
  tooltipHovered: boolean;
  /** Focus is on the trigger. */
  focused: boolean;
  /** Closed with Escape: stays closed until the pointer and focus have left. */
  dismissed: boolean;
};

export type Field = keyof State;

export type Changes = Set<Field>;

/** What the pointer is over. */
export type HoverTarget = "trigger" | "tooltip";

export type Placement = "top" | "bottom" | "left" | "right";

/** CSS anchor positioning for a placement. */
export type Position = {
  /** `position-area`. */
  area: Placement;
  /** `position-try-fallbacks`: flips to the other side on the same axis. */
  fallback: "flip-block" | "flip-inline";
};

const PLACEMENTS: Placement[] = ["top", "bottom", "left", "right"];

export function createState(): State {
  return {
    open: false,
    disabled: false,
    triggerHovered: false,
    tooltipHovered: false,
    focused: false,
    dismissed: false,
  };
}

// Changing the state

/** The pointer entered or left the trigger or the tooltip. */
export function hover(state: State, target: HoverTarget, isHovered: boolean): Changes {
  const changes: Changes = new Set();

  if (target === "trigger") {
    set(state, changes, "triggerHovered", isHovered);
  }

  if (target === "tooltip") {
    set(state, changes, "tooltipHovered", isHovered);
  }

  forgetDismissal(state, changes);

  return changes;
}

/** Focus moved onto or off the trigger. */
export function focus(state: State, isFocused: boolean): Changes {
  const changes: Changes = new Set();

  set(state, changes, "focused", isFocused);
  forgetDismissal(state, changes);

  return changes;
}

/** Escape: closes, and stays closed until the pointer and focus have left. */
export function dismiss(state: State): Changes {
  const changes: Changes = new Set();

  if (!state.open && !shouldBeOpen(state)) {
    return changes;
  }

  set(state, changes, "open", false);
  set(state, changes, "dismissed", true);

  return changes;
}

export function setDisabled(state: State, disabled: boolean): Changes {
  const changes: Changes = new Set();

  set(state, changes, "disabled", disabled);

  if (disabled) {
    set(state, changes, "open", false);
  }

  return changes;
}

/** Opens or closes now: after a delay, or from the `open` attribute, `show()` and `hide()`. */
export function setOpen(state: State, open: boolean): Changes {
  const changes: Changes = new Set();

  if (open && state.disabled) {
    return changes;
  }

  set(state, changes, "open", open);

  return changes;
}

// Reading the state

/** Wanted open: hovered or focused, and neither disabled nor dismissed. */
export function shouldBeOpen(state: State): boolean {
  if (state.disabled || state.dismissed) {
    return false;
  }

  return state.triggerHovered || state.tooltipHovered || state.focused;
}

/** Anchor positioning for the `placement` attribute; `top` by default. */
export function position(placement: string | null): Position {
  const area = PLACEMENTS.find((candidate) => candidate === placement) ?? "top";

  if (area === "left" || area === "right") {
    return { area, fallback: "flip-inline" };
  }

  return { area, fallback: "flip-block" };
}

/** A delay attribute in milliseconds; `fallback` when missing, invalid or negative. */
export function parseDelay(value: string | null, fallback: number): number {
  if (value === null || value.trim() === "") {
    return fallback;
  }

  const delay = Number(value);

  if (!Number.isFinite(delay) || delay < 0) {
    return fallback;
  }

  return delay;
}

// Helpers

/** Once nothing holds the tooltip any more, an Escape no longer applies. */
function forgetDismissal(state: State, changes: Changes): void {
  if (state.triggerHovered || state.tooltipHovered || state.focused) {
    return;
  }

  set(state, changes, "dismissed", false);
}

function set<K extends Field>(state: State, changes: Changes, field: K, value: State[K]): void {
  if (state[field] === value) {
    return;
  }

  state[field] = value;
  changes.add(field);
}
