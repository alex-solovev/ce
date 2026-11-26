import { defineElement } from "../core/dom.ts";
import * as logic from "./logic.ts";
import type { Changes, HoverTarget } from "./logic.ts";
import * as render from "./render.ts";
import type { TooltipContext } from "./render.ts";

/** Default `show-delay`, in milliseconds. */
const SHOW_DELAY = 150;

/** Default `hide-delay`, in milliseconds. */
const HIDE_DELAY = 0;

/**
 * After the pointer leaves, at least this long before hiding, so it can
 * cross the gap onto the tooltip (WCAG 1.4.13, hoverable).
 */
const HOVER_GRACE = 100;

/**
 * Short description of another element, shown on hover and focus.
 *
 * Positioned with CSS anchor positioning; load a polyfill for browsers
 * without it. Rich content is fine, but nothing interactive: the tooltip
 * can't be focused, and its content is read as the trigger's description.
 * Use a popover for content people act on.
 *
 * @attr for - The id of the element it describes, in the same document or shadow root.
 * @attr placement - `top` (default), `bottom`, `left` or `right`. Flips to the opposite side when there's no room.
 * @attr open - Reflects whether it's shown; set it to show.
 * @attr disabled - Never shows.
 * @attr show-delay - Milliseconds of hovering or focus before it shows. Default 150.
 * @attr hide-delay - Milliseconds before it hides once left. Leaving by pointer waits at least 100, to allow reaching the tooltip.
 * @slot - The tooltip's content.
 * @fires beforetoggle - The popover's own event, before it shows or hides.
 * @fires toggle - The popover's own event, after it showed or hid.
 */
export class CeTooltip extends HTMLElement {
  static observedAttributes: string[] = [
    "for",
    "placement",
    "open",
    "disabled",
    "show-delay",
    "hide-delay",
  ];

  #internals = this.attachInternals();

  /** Exists from the start, so `open` and `disabled` set before connecting are kept. */
  #state = logic.createState();

  /** Created on first connect; until then nothing is rendered. */
  #context: TooltipContext | null = null;

  /** Set through `anchor`; wins over `for`. */
  #explicitAnchor: HTMLElement | null = null;

  /** Pending show or hide. */
  #timer: ReturnType<typeof setTimeout> | undefined;

  /** Pending second look for a `for` trigger that wasn't in the page yet. */
  #retryFrame = 0;

  /** Reflects the `for` attribute, like `<label>`'s `htmlFor`. */
  get htmlFor(): string {
    return this.getAttribute("for") ?? "";
  }

  set htmlFor(value: string) {
    this.setAttribute("for", value);
  }

  /**
   * The element it describes and is anchored to. Setting an element uses it
   * instead of `for`, e.g. across shadow roots; setting null goes back to `for`.
   */
  get anchor(): HTMLElement | null {
    return this.#context?.anchor ?? null;
  }

  set anchor(element: HTMLElement | null) {
    this.#explicitAnchor = element;
    this.#bind(true);
  }

  /** Reflects the `placement` attribute. */
  get placement(): string {
    return this.getAttribute("placement") ?? "top";
  }

  set placement(value: string) {
    this.setAttribute("placement", value);
  }

  /** Reflects the `open` attribute. */
  get open(): boolean {
    return this.hasAttribute("open");
  }

  set open(value: boolean) {
    this.toggleAttribute("open", Boolean(value));
  }

  /** Reflects the `disabled` attribute. */
  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }

  set disabled(value: boolean) {
    this.toggleAttribute("disabled", Boolean(value));
  }

  /** Reflects the `show-delay` attribute, in milliseconds. */
  get showDelay(): number {
    return logic.parseDelay(this.getAttribute("show-delay"), SHOW_DELAY);
  }

  set showDelay(value: number) {
    this.setAttribute("show-delay", String(value));
  }

  /** Reflects the `hide-delay` attribute, in milliseconds. */
  get hideDelay(): number {
    return logic.parseDelay(this.getAttribute("hide-delay"), HIDE_DELAY);
  }

  set hideDelay(value: number) {
    this.setAttribute("hide-delay", String(value));
  }

  /** Shows now, without the delay. */
  show(): void {
    this.#showNow(true);
  }

  /** Hides now, without the delay. */
  hide(): void {
    this.#showNow(false);
  }

  connectedCallback(): void {
    if (!this.#context) {
      this.#setup();
    }

    const context = this.#context;

    if (!context) {
      return;
    }

    render.position(context, this.getAttribute("placement"));
    this.#render(logic.setDisabled(this.#state, this.disabled));
    this.#bind(true);
    this.#render(logic.setOpen(this.#state, this.open));
  }

  disconnectedCallback(): void {
    clearTimeout(this.#timer);
    cancelAnimationFrame(this.#retryFrame);
    this.#unbind();
    this.#render(logic.setOpen(this.#state, false));
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

    if (name === "for") {
      this.#bind(true);
      return;
    }

    if (name === "placement") {
      render.position(context, newValue);
      return;
    }

    if (name === "open") {
      this.#showNow(newValue !== null);
      return;
    }

    if (name === "disabled") {
      this.#render(logic.setDisabled(this.#state, newValue !== null));
      this.#schedule(0);
      return;
    }
  }

  #setup() {
    this.#context = render.createContext(this, this.#internals, this.#state);

    // The pointer may move onto the tooltip itself.
    this.addEventListener("pointerenter", this.#onTooltipPointerenter);
    this.addEventListener("pointerleave", this.#onTooltipPointerleave);
  }

  /** Renders what changed. Nothing is rendered before setup. */
  #render(changes: Changes) {
    const context = this.#context;

    if (!context || !changes.has("open")) {
      return;
    }

    render.open(context);

    // Escape closes it; only listened to while open.
    if (this.#state.open) {
      document.addEventListener("keydown", this.#onDocumentKeydown);
      return;
    }

    document.removeEventListener("keydown", this.#onDocumentKeydown);
  }

  /** Opens or closes right away, dropping any pending delay. */
  #showNow(open: boolean) {
    clearTimeout(this.#timer);
    this.#render(logic.setOpen(this.#state, open));
  }

  /**
   * After hover or focus changed: opens or closes once the delay has passed,
   * if it still should then.
   * @param minHideDelay At least this long before hiding.
   */
  #schedule(minHideDelay: number) {
    clearTimeout(this.#timer);

    const shouldOpen = logic.shouldBeOpen(this.#state);

    if (shouldOpen === this.#state.open) {
      return;
    }

    const delay = shouldOpen ? this.showDelay : Math.max(this.hideDelay, minHideDelay);

    if (delay === 0) {
      this.#render(logic.setOpen(this.#state, shouldOpen));
      return;
    }

    this.#timer = setTimeout(() => {
      this.#render(logic.setOpen(this.#state, logic.shouldBeOpen(this.#state)));
    }, delay);
  }

  // Trigger

  /**
   * Binds to the trigger: the `anchor` element, or the element `for` names.
   * A changed trigger closes the tooltip.
   * @param shouldRetry When `for` matches nothing yet, look once more on the
   *   next frame: the trigger may come later in the same parse or update.
   */
  #bind(shouldRetry: boolean) {
    const context = this.#context;

    cancelAnimationFrame(this.#retryFrame);

    if (!context || !this.isConnected) {
      return;
    }

    const trigger = this.#explicitAnchor ?? this.#findTrigger();

    if (!trigger && shouldRetry && this.htmlFor !== "") {
      this.#retryFrame = requestAnimationFrame(() => {
        this.#bind(false);
      });
    }

    if (trigger === context.anchor) {
      return;
    }

    this.#unbind();

    if (!trigger) {
      return;
    }

    render.anchor(context, trigger);

    trigger.addEventListener("pointerenter", this.#onTriggerPointerenter);
    trigger.addEventListener("pointerleave", this.#onTriggerPointerleave);
    trigger.addEventListener("focusin", this.#onTriggerFocusin);
    trigger.addEventListener("focusout", this.#onTriggerFocusout);
  }

  /** Lets go of the trigger and forgets its hover and focus, closing the tooltip. */
  #unbind() {
    const context = this.#context;
    const trigger = context?.anchor;

    if (!context || !trigger) {
      return;
    }

    trigger.removeEventListener("pointerenter", this.#onTriggerPointerenter);
    trigger.removeEventListener("pointerleave", this.#onTriggerPointerleave);
    trigger.removeEventListener("focusin", this.#onTriggerFocusin);
    trigger.removeEventListener("focusout", this.#onTriggerFocusout);

    render.anchor(context, null);

    logic.hover(this.#state, "trigger", false);
    logic.hover(this.#state, "tooltip", false);
    logic.focus(this.#state, false);
    this.#showNow(false);
  }

  /** The element `for` names, in the tooltip's own document or shadow root. */
  #findTrigger(): HTMLElement | null {
    const id = this.htmlFor;
    const root = this.getRootNode();

    if (id === "") {
      return null;
    }

    if (!(root instanceof Document || root instanceof ShadowRoot)) {
      return null;
    }

    const element = root.getElementById(id);

    return element instanceof HTMLElement ? element : null;
  }

  // Pointer: a mouse or pen hovering. Touch has no hover; a tap shows the
  // tooltip through focus instead.

  #onTriggerPointerenter = (event: PointerEvent) => {
    this.#hover(event, "trigger", true);
  };

  #onTriggerPointerleave = (event: PointerEvent) => {
    this.#hover(event, "trigger", false);
  };

  #onTooltipPointerenter = (event: PointerEvent) => {
    this.#hover(event, "tooltip", true);
  };

  #onTooltipPointerleave = (event: PointerEvent) => {
    this.#hover(event, "tooltip", false);
  };

  #hover(event: PointerEvent, target: HoverTarget, isHovered: boolean) {
    if (event.pointerType === "touch") {
      return;
    }

    logic.hover(this.#state, target, isHovered);
    this.#schedule(HOVER_GRACE);
  }

  // Focus

  #onTriggerFocusin = () => {
    logic.focus(this.#state, true);
    this.#schedule(0);
  };

  #onTriggerFocusout = (event: FocusEvent) => {
    const next = event.relatedTarget;

    // Focus moving between elements inside the trigger.
    if (next instanceof Node && this.#context?.anchor?.contains(next)) {
      return;
    }

    logic.focus(this.#state, false);
    this.#schedule(0);
  };

  // Escape closes it without moving focus (WCAG 1.4.13, dismissible), and
  // only it: not a surrounding dialog.
  #onDocumentKeydown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") {
      return;
    }

    const changes = logic.dismiss(this.#state);

    if (changes.size === 0) {
      return;
    }

    event.preventDefault();
    clearTimeout(this.#timer);
    this.#render(changes);
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "ce-tooltip": CeTooltip;
  }
}

defineElement("ce-tooltip", CeTooltip);
