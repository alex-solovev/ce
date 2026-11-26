// ce-tooltip's shadow DOM and everything that writes to the page. The
// component calls these with its context; they read the state and update
// the DOM.

import type { CeTooltip } from "./ce-tooltip.ts";
import * as logic from "./logic.ts";
import type { State } from "./logic.ts";

const template = document.createElement("template");
template.innerHTML = `
  <style>
    /* The host is the popover. Never set display here: the browser's
       [popover] rules hide it while closed. */
    :host {
      inset: auto;
      box-sizing: border-box;
      max-width: 20em;
      margin: 0.5em;
      padding: 0.25em 0.5em;
      border: 0;
      border-radius: 4px;
      background: CanvasText;
      color: Canvas;
      font-size: 0.875em;
      line-height: 1.4;
      overflow: visible;
    }
  </style>
  <slot></slot>
`;

/** Counts tooltips, for unique anchor names. */
let tooltipCount = 0;

export type TooltipContext = {
  host: CeTooltip;
  root: ShadowRoot;
  internals: ElementInternals;
  state: State;
  /** The trigger it's anchored to and describes, if any. */
  anchor: HTMLElement | null;
  /** Added to the trigger's `anchor-name`; unique per tooltip. */
  anchorName: string;
};

/** Attaches the shadow DOM, makes the host a popover and creates the context. Call once. */
export function createContext(
  host: CeTooltip,
  internals: ElementInternals,
  state: State,
): TooltipContext {
  const root = host.attachShadow({ mode: "open" });
  root.append(template.content.cloneNode(true));

  // Manual: opening doesn't close other popovers (an open select list),
  // and the component decides when it closes.
  host.popover = "manual";
  internals.role = "tooltip";

  tooltipCount += 1;

  return {
    host,
    root,
    internals,
    state,
    anchor: null,
    anchorName: `--ce-tooltip-${tooltipCount}`,
  };
}

/**
 * Anchors the tooltip to `element` and makes it the element's description,
 * undoing both on the previous trigger. Adds to the trigger's own anchor
 * names and descriptions instead of replacing them. Inline styles, which
 * the anchor positioning polyfill can read. An `anchor-name` the trigger
 * gets from a stylesheet is overridden by the inline one.
 */
export function anchor(context: TooltipContext, element: HTMLElement | null): void {
  const { host, anchorName } = context;
  const previous = context.anchor;

  if (previous === element) {
    return;
  }

  context.anchor = element;

  if (previous) {
    const names: string[] = [];

    for (const name of anchorNames(previous)) {
      if (name !== anchorName) {
        names.push(name);
      }
    }

    setAnchorNames(previous, names);

    const descriptions: Element[] = [];

    for (const description of previous.ariaDescribedByElements ?? []) {
      if (description !== host) {
        descriptions.push(description);
      }
    }

    previous.ariaDescribedByElements = descriptions.length > 0 ? descriptions : null;
  }

  if (!element) {
    return;
  }

  const names = anchorNames(element);
  names.push(anchorName);
  setAnchorNames(element, names);

  const descriptions = [...(element.ariaDescribedByElements ?? [])];
  descriptions.push(host);
  element.ariaDescribedByElements = descriptions;
}

/** Positions the tooltip against its anchor name, on the side `placement` names. */
export function position(context: TooltipContext, placement: string | null): void {
  const { host, anchorName } = context;
  const { area, fallback } = logic.position(placement);

  host.style.setProperty("position-anchor", anchorName);
  host.style.setProperty("position-area", area);
  host.style.setProperty("position-try-fallbacks", fallback);
}

/** Shows or hides the popover, and reflects `open`. */
export function open(context: TooltipContext): void {
  const { host, state } = context;

  host.toggleAttribute("open", state.open);

  // A popover can only show while in the page.
  if (!host.isConnected) {
    return;
  }

  const isShown = host.matches(":popover-open");

  if (state.open && !isShown) {
    host.showPopover();
    return;
  }

  if (!state.open && isShown) {
    host.hidePopover();
  }
}

/** The element's inline anchor names. */
function anchorNames(element: HTMLElement): string[] {
  const names: string[] = [];

  for (const name of element.style.getPropertyValue("anchor-name").split(",")) {
    const trimmed = name.trim();

    if (trimmed !== "" && trimmed !== "none") {
      names.push(trimmed);
    }
  }

  return names;
}

function setAnchorNames(element: HTMLElement, names: string[]): void {
  if (names.length === 0) {
    element.style.removeProperty("anchor-name");
    return;
  }

  element.style.setProperty("anchor-name", names.join(", "));
}
