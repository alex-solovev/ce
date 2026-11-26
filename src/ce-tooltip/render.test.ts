import { afterEach, describe, expect, it } from "vite-plus/test";
import type { CeTooltip } from "./ce-tooltip.ts";
import * as logic from "./logic.ts";
import * as render from "./render.ts";
import type { TooltipContext } from "./render.ts";

/**
 * Stands in for ce-tooltip: real internals, but none of its behaviour, so
 * render functions can be called directly.
 */
class TestTooltip extends HTMLElement {
  internals: ElementInternals = this.attachInternals();
}

customElements.define("render-test-tooltip", TestTooltip);

type Setup = {
  host: TestTooltip;
  button: HTMLButtonElement;
  context: TooltipContext;
};

afterEach(() => {
  document.body.replaceChildren();
});

/** A connected tooltip host next to a button, and its context. */
function setup(): Setup {
  const host = new TestTooltip();
  const button = document.createElement("button");
  host.textContent = "Saves the draft";
  button.textContent = "Save";
  document.body.append(button, host);

  const context = render.createContext(
    host as unknown as CeTooltip,
    host.internals,
    logic.createState(),
  );

  return { host, button, context };
}

function anchorNames(element: HTMLElement): string {
  return element.style.getPropertyValue("anchor-name");
}

describe("createContext", () => {
  it("makes the host a manual popover with the tooltip role, showing its content", () => {
    const { host, context } = setup();

    expect(host.popover).toBe("manual");
    expect(host.internals.role).toBe("tooltip");
    expect(context.root.querySelector("slot")?.assignedNodes()).toEqual([...host.childNodes]);
  });

  it("gives every tooltip its own anchor name", () => {
    const first = setup().context;
    const second = setup().context;

    expect(first.anchorName).toMatch(/^--ce-tooltip-\d+$/);
    expect(second.anchorName).not.toBe(first.anchorName);
  });
});

describe("anchor", () => {
  it("anchors to the trigger and describes it", () => {
    const { host, button, context } = setup();

    render.anchor(context, button);

    expect(context.anchor).toBe(button);
    expect(anchorNames(button)).toBe(context.anchorName);
    expect(button.ariaDescribedByElements).toEqual([host]);
  });

  it("keeps the trigger's other anchor names and descriptions", () => {
    const { host, button, context } = setup();
    const note = document.createElement("p");
    note.id = "note";
    document.body.append(note);
    button.style.setProperty("anchor-name", "--menu");
    button.setAttribute("aria-describedby", "note");

    render.anchor(context, button);

    expect(anchorNames(button)).toBe(`--menu, ${context.anchorName}`);
    expect(button.ariaDescribedByElements).toEqual([note, host]);

    render.anchor(context, null);

    expect(anchorNames(button)).toBe("--menu");
    expect(button.ariaDescribedByElements).toEqual([note]);
  });

  it("cleans up the previous trigger when moving to another", () => {
    const { host, button, context } = setup();
    const other = document.createElement("button");
    document.body.append(other);

    render.anchor(context, button);
    render.anchor(context, other);

    expect(anchorNames(button)).toBe("");
    expect(button.ariaDescribedByElements).toBe(null);
    expect(anchorNames(other)).toBe(context.anchorName);
    expect(other.ariaDescribedByElements).toEqual([host]);
  });

  it("does nothing when given the same trigger again", () => {
    const { host, button, context } = setup();

    render.anchor(context, button);
    render.anchor(context, button);

    expect(anchorNames(button)).toBe(context.anchorName);
    expect(button.ariaDescribedByElements).toEqual([host]);
  });

  it("lets two tooltips share a trigger", () => {
    const { host, button, context } = setup();
    const second = setup();

    render.anchor(context, button);
    render.anchor(second.context, button);

    expect(anchorNames(button)).toBe(`${context.anchorName}, ${second.context.anchorName}`);
    expect(button.ariaDescribedByElements).toEqual([host, second.host]);

    render.anchor(context, null);

    expect(anchorNames(button)).toBe(second.context.anchorName);
    expect(button.ariaDescribedByElements).toEqual([second.host]);
  });
});

describe("position", () => {
  it("positions against its own anchor name, by placement", () => {
    const { host, context } = setup();

    render.position(context, "left");

    expect(host.style.getPropertyValue("position-anchor")).toBe(context.anchorName);
    expect(host.style.getPropertyValue("position-area")).toBe("left");
    expect(host.style.getPropertyValue("position-try-fallbacks")).toBe("flip-inline");

    render.position(context, null);

    expect(host.style.getPropertyValue("position-area")).toBe("top");
    expect(host.style.getPropertyValue("position-try-fallbacks")).toBe("flip-block");
  });
});

describe("open", () => {
  it("shows and hides the popover and reflects `open`", () => {
    const { host, context } = setup();

    logic.setOpen(context.state, true);
    render.open(context);

    expect(host.matches(":popover-open")).toBe(true);
    expect(host.hasAttribute("open")).toBe(true);

    logic.setOpen(context.state, false);
    render.open(context);

    expect(host.matches(":popover-open")).toBe(false);
    expect(host.hasAttribute("open")).toBe(false);
  });

  it("only reflects `open` while out of the page, where a popover can't show", () => {
    const { host, context } = setup();
    host.remove();

    logic.setOpen(context.state, true);
    render.open(context);

    expect(host.hasAttribute("open")).toBe(true);
    expect(host.matches(":popover-open")).toBe(false);
  });
});
