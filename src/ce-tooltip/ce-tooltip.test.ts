import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";
import { accessibleNodeDetails, withRole } from "../core/test-accessibility.ts";
import { axeViolations } from "../core/test-axe.ts";
import { query } from "../core/test-dom.ts";
import "./ce-tooltip.ts";
import type { CeTooltip } from "./ce-tooltip.ts";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

type Rendered = {
  container: HTMLElement;
  button: HTMLButtonElement;
  tooltip: CeTooltip;
};

/** Renders a button and a tooltip for it, with no delays unless given. */
function render(attributes = `show-delay="0"`, content = "Saves the draft"): Rendered {
  const container = document.createElement("div");
  container.style.padding = "4em";
  container.innerHTML = `
    <button type="button" id="save">Save</button>
    <ce-tooltip for="save" ${attributes}>${content}</ce-tooltip>
  `;
  document.body.append(container);

  return {
    container,
    button: query(container, "button"),
    tooltip: query(container, "ce-tooltip"),
  };
}

function isShown(tooltip: CeTooltip): boolean {
  return tooltip.matches(":popover-open");
}

function pointer(target: Element, type: string, pointerType = "mouse"): void {
  target.dispatchEvent(new PointerEvent(type, { pointerType, isPrimary: true }));
}

function hover(target: Element, pointerType = "mouse"): void {
  pointer(target, "pointerenter", pointerType);
}

function leave(target: Element, pointerType = "mouse"): void {
  pointer(target, "pointerleave", pointerType);
}

/** Lets queued tasks run, such as the popover's `toggle` event. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

describe("ce-tooltip", () => {
  describe("hover", () => {
    it("shows after the show delay, not before", () => {
      vi.useFakeTimers();
      const { button, tooltip } = render(`show-delay="300"`);

      hover(button);
      vi.advanceTimersByTime(299);
      expect(isShown(tooltip)).toBe(false);

      vi.advanceTimersByTime(1);
      expect(isShown(tooltip)).toBe(true);
    });

    it("waits 150ms by default", () => {
      vi.useFakeTimers();
      const { button, tooltip } = render("");

      hover(button);
      vi.advanceTimersByTime(149);
      expect(isShown(tooltip)).toBe(false);

      vi.advanceTimersByTime(1);
      expect(isShown(tooltip)).toBe(true);
    });

    it("doesn't show when the pointer leaves before the delay", () => {
      vi.useFakeTimers();
      const { button, tooltip } = render(`show-delay="300"`);

      hover(button);
      vi.advanceTimersByTime(200);
      leave(button);
      vi.advanceTimersByTime(500);

      expect(isShown(tooltip)).toBe(false);
    });

    it("hides shortly after the pointer leaves, leaving time to reach the tooltip", () => {
      vi.useFakeTimers();
      const { button, tooltip } = render();

      hover(button);
      expect(isShown(tooltip)).toBe(true);

      leave(button);
      vi.advanceTimersByTime(99);
      expect(isShown(tooltip)).toBe(true);

      vi.advanceTimersByTime(1);
      expect(isShown(tooltip)).toBe(false);
    });

    it("waits for a longer hide delay", () => {
      vi.useFakeTimers();
      const { button, tooltip } = render(`show-delay="0" hide-delay="400"`);

      hover(button);
      leave(button);
      vi.advanceTimersByTime(399);
      expect(isShown(tooltip)).toBe(true);

      vi.advanceTimersByTime(1);
      expect(isShown(tooltip)).toBe(false);
    });

    // WCAG 1.4.13: the pointer can move onto the tooltip, e.g. to read or
    // select its text.
    it("stays open while the pointer is on the tooltip", () => {
      vi.useFakeTimers();
      const { button, tooltip } = render();

      hover(button);
      leave(button);
      vi.advanceTimersByTime(50);
      hover(tooltip);
      vi.advanceTimersByTime(1000);
      expect(isShown(tooltip)).toBe(true);

      leave(tooltip);
      vi.advanceTimersByTime(100);
      expect(isShown(tooltip)).toBe(false);
    });

    it("ignores touch: a tap shows it through focus instead", () => {
      const { button, tooltip } = render();

      hover(button, "touch");
      expect(isShown(tooltip)).toBe(false);
    });

    it("shows for a pen hovering", () => {
      const { button, tooltip } = render();

      hover(button, "pen");
      expect(isShown(tooltip)).toBe(true);
    });

    it("shows on a real pointer hover", async () => {
      const { button, tooltip } = render();

      await userEvent.hover(button);
      expect(isShown(tooltip)).toBe(true);
    });
  });

  describe("focus", () => {
    it("shows on focus and hides when focus leaves", () => {
      const { button, tooltip } = render();
      const other = document.createElement("button");
      document.body.append(other);

      button.focus();
      expect(isShown(tooltip)).toBe(true);

      other.focus();
      expect(isShown(tooltip)).toBe(false);
    });

    it("stays open while focus moves inside the trigger", () => {
      const container = document.createElement("div");
      container.innerHTML = `
        <span id="group"><button type="button">A</button><button type="button">B</button></span>
        <ce-tooltip for="group" show-delay="0">Formatting</ce-tooltip>
      `;
      document.body.append(container);

      const [first, second] = container.querySelectorAll("button");
      const tooltip = query<CeTooltip>(container, "ce-tooltip");

      first?.focus();
      second?.focus();

      expect(isShown(tooltip)).toBe(true);
    });

    it("stays open after focus leaves while the pointer is still on the trigger", () => {
      const { button, tooltip } = render();

      hover(button);
      button.focus();
      button.blur();

      expect(isShown(tooltip)).toBe(true);
    });
  });

  describe("Escape", () => {
    it("closes without moving focus, and stays closed while hovered or focused", () => {
      const { button, tooltip } = render();

      hover(button);
      button.focus();

      const escape = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      button.dispatchEvent(escape);

      expect(isShown(tooltip)).toBe(false);
      expect(escape.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(button);

      leave(button);
      hover(button);
      expect(isShown(tooltip)).toBe(false);
    });

    it("shows again once the pointer and focus have left and come back", () => {
      vi.useFakeTimers();
      const { button, tooltip } = render();

      hover(button);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      leave(button);
      vi.advanceTimersByTime(100);
      hover(button);

      expect(isShown(tooltip)).toBe(true);
    });

    it("leaves Escape alone while closed", () => {
      render();

      const escape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
      document.dispatchEvent(escape);

      expect(escape.defaultPrevented).toBe(false);
    });

    it("ignores other keys", () => {
      const { button, tooltip } = render();

      hover(button);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

      expect(isShown(tooltip)).toBe(true);
    });
  });

  describe("open, show() and hide()", () => {
    it("shows from the `open` attribute, and reflects it", () => {
      const { button, tooltip } = render(`show-delay="0" open`);

      expect(isShown(tooltip)).toBe(true);
      expect(tooltip.open).toBe(true);

      tooltip.open = false;
      expect(isShown(tooltip)).toBe(false);
      expect(tooltip.hasAttribute("open")).toBe(false);

      hover(button);
      expect(tooltip.hasAttribute("open")).toBe(true);
    });

    it("shows and hides with show() and hide(), without delays", () => {
      const { tooltip } = render(`show-delay="500"`);

      tooltip.show();
      expect(isShown(tooltip)).toBe(true);

      tooltip.hide();
      expect(isShown(tooltip)).toBe(false);
    });

    it("fires the popover's beforetoggle and toggle events", async () => {
      const { tooltip } = render();
      const events: string[] = [];

      tooltip.addEventListener("beforetoggle", (event) => {
        events.push(`before:${event.newState}`);
      });

      tooltip.addEventListener("toggle", (event) => {
        events.push(event.newState);
      });

      tooltip.show();
      await nextTask();

      expect(events).toEqual(["before:open", "open"]);
    });
  });

  describe("disabled", () => {
    it("doesn't show while disabled", () => {
      const { button, tooltip } = render(`show-delay="0" disabled`);

      hover(button);
      button.focus();
      tooltip.show();

      expect(isShown(tooltip)).toBe(false);
    });

    it("closes when disabled while open, and shows again when enabled while hovered", () => {
      const { button, tooltip } = render();

      hover(button);
      tooltip.disabled = true;
      expect(isShown(tooltip)).toBe(false);

      tooltip.disabled = false;
      expect(isShown(tooltip)).toBe(true);
    });
  });

  describe("trigger", () => {
    it("moves to another trigger when `for` changes", () => {
      const { container, button, tooltip } = render();
      const other = document.createElement("button");
      other.id = "other";
      container.append(other);

      tooltip.htmlFor = "other";

      expect(button.ariaDescribedByElements).toBe(null);
      expect(other.ariaDescribedByElements).toEqual([tooltip]);
      expect(tooltip.anchor).toBe(other);

      hover(button);
      expect(isShown(tooltip)).toBe(false);

      hover(other);
      expect(isShown(tooltip)).toBe(true);
    });

    it("closes when it moves to another trigger while open", () => {
      const { container, button, tooltip } = render();
      const other = document.createElement("button");
      other.id = "other";
      container.append(other);

      hover(button);
      tooltip.htmlFor = "other";

      expect(isShown(tooltip)).toBe(false);
    });

    it("takes an element through `anchor`, over `for`", () => {
      const { container, button, tooltip } = render();
      const other = document.createElement("button");
      container.append(other);

      tooltip.anchor = other;

      expect(tooltip.anchor).toBe(other);
      expect(button.ariaDescribedByElements).toBe(null);

      hover(other);
      expect(isShown(tooltip)).toBe(true);

      tooltip.anchor = null;
      expect(tooltip.anchor).toBe(button);
    });

    it("finds its trigger in its own shadow root", () => {
      const host = document.createElement("div");
      const root = host.attachShadow({ mode: "open" });
      root.innerHTML = `
        <button type="button" id="save">Save</button>
        <ce-tooltip for="save" show-delay="0">Saves the draft</ce-tooltip>
      `;
      document.body.append(host);

      const tooltip = query<CeTooltip>(root, "ce-tooltip");

      expect(tooltip.anchor).toBe(query(root, "button"));
    });

    it("finds a trigger that comes after it in the same frame", async () => {
      const container = document.createElement("div");
      document.body.append(container);

      const tooltip = document.createElement("ce-tooltip");
      tooltip.htmlFor = "late";
      container.append(tooltip);

      const button = document.createElement("button");
      button.id = "late";
      container.append(button);

      await nextFrame();

      expect(tooltip.anchor).toBe(button);
      expect(button.ariaDescribedByElements).toEqual([tooltip]);
    });

    it("has no trigger when `for` matches nothing", async () => {
      const { tooltip } = render(`show-delay="0"`);

      tooltip.htmlFor = "missing";
      await nextFrame();

      expect(tooltip.anchor).toBe(null);
    });

    it("lets two tooltips share a trigger", () => {
      const { container, button, tooltip } = render();
      container.insertAdjacentHTML(
        "beforeend",
        `<ce-tooltip for="save" show-delay="0">Ctrl+S</ce-tooltip>`,
      );
      const second = query<CeTooltip>(container, "ce-tooltip:last-of-type");

      hover(button);

      expect(isShown(tooltip)).toBe(true);
      expect(isShown(second)).toBe(true);
      expect(button.ariaDescribedByElements).toEqual([tooltip, second]);
    });
  });

  describe("lifecycle", () => {
    it("cleans up the trigger and stops listening when removed", () => {
      const { button, tooltip } = render();
      const removeListener = vi.spyOn(document, "removeEventListener");

      hover(button);
      tooltip.remove();

      expect(tooltip.open).toBe(false);
      expect(button.ariaDescribedByElements).toBe(null);
      expect(button.style.getPropertyValue("anchor-name")).toBe("");
      expect(removeListener).toHaveBeenCalledWith("keydown", expect.any(Function));

      removeListener.mockRestore();
    });

    it("doesn't show after removal when a pending show comes due", () => {
      vi.useFakeTimers();
      const { container, button, tooltip } = render(`show-delay="300"`);

      hover(button);
      tooltip.remove();
      vi.advanceTimersByTime(300);
      container.append(tooltip);

      expect(isShown(tooltip)).toBe(false);
    });

    it("works again when put back", () => {
      const { container, button, tooltip } = render();

      tooltip.remove();
      container.append(tooltip);
      hover(button);

      expect(isShown(tooltip)).toBe(true);
      expect(button.ariaDescribedByElements).toEqual([tooltip]);
    });
  });

  describe("positioning", () => {
    it("sits above the trigger by default", () => {
      const { button, tooltip } = render();

      tooltip.show();

      expect(tooltip.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        button.getBoundingClientRect().top,
      );
    });

    it("sits on the side `placement` names", () => {
      const { button, tooltip } = render(`show-delay="0" placement="right"`);

      tooltip.show();
      expect(tooltip.getBoundingClientRect().left).toBeGreaterThanOrEqual(
        button.getBoundingClientRect().right,
      );

      tooltip.placement = "bottom";
      expect(tooltip.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        button.getBoundingClientRect().bottom,
      );
    });

    it("flips below when there's no room above", () => {
      const { container, button, tooltip } = render();
      container.style.padding = "0";

      tooltip.show();

      expect(tooltip.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        button.getBoundingClientRect().bottom,
      );
    });
  });

  describe("accessibility", () => {
    it("describes the trigger with its text, also while closed", async () => {
      render();

      const [button] = withRole(await accessibleNodeDetails(), "button");

      expect(button).toMatchObject({ name: "Save", description: "Saves the draft" });
    });

    it("describes the trigger with the text of rich content", async () => {
      render(`show-delay="0"`, `Saves the <strong>draft</strong>, <kbd>Ctrl+S</kbd>`);

      const [button] = withRole(await accessibleNodeDetails(), "button");

      expect(button?.description).toBe("Saves the draft, Ctrl+S");
    });

    it("keeps the trigger's own description", async () => {
      const { container } = render();
      const note = document.createElement("p");
      note.id = "note";
      note.textContent = "Unsaved";
      container.append(note);
      query(container, "button").setAttribute("aria-describedby", "note");
      query<CeTooltip>(container, "ce-tooltip").htmlFor = "";
      query<CeTooltip>(container, "ce-tooltip").htmlFor = "save";

      const [button] = withRole(await accessibleNodeDetails(), "button");

      expect(button?.description).toBe("Unsaved Saves the draft");
    });

    it("is a tooltip while open, and out of the tree while closed", async () => {
      const { tooltip } = render();

      expect(withRole(await accessibleNodeDetails(), "tooltip")).toEqual([]);

      tooltip.show();

      expect(withRole(await accessibleNodeDetails(), "tooltip")).toMatchObject([
        { name: "Saves the draft" },
      ]);
    });

    it("passes axe, closed and open", async () => {
      const { container, tooltip } = render();

      expect(await axeViolations(container)).toEqual([]);

      tooltip.show();

      expect(await axeViolations(container)).toEqual([]);
    });
  });
});
