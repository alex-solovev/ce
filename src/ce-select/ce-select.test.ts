import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";
import { accessibleNodeDetails } from "../core/test-accessibility.ts";
import type { AccessibleNode } from "../core/test-accessibility.ts";
import { query, queryShadow } from "../core/test-dom.ts";
import "./ce-select.ts";
import type { CeOption } from "./ce-option.ts";
import type { CeSelect } from "./ce-select.ts";

afterEach(() => {
  document.body.replaceChildren();
});

const fruits = `
  <ce-option value="apple">Apple</ce-option>
  <ce-option value="banana">Banana<span slot="description">Yellow</span></ce-option>
  <ce-option value="cherry" disabled>Cherry</ce-option>
  <ce-option value="date">Date</ce-option>
`;

type Rendered = {
  form: HTMLFormElement;
  select: CeSelect;
  events: string[];
};

/** Renders a form with one select, recording its input / change events. */
function render(html: string): Rendered {
  const form = document.createElement("form");
  form.innerHTML = html;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  document.body.append(form);

  const select = query(form, "ce-select");
  const events: string[] = [];

  select.addEventListener("input", () => {
    events.push("input");
  });

  select.addEventListener("change", () => {
    events.push("change");
  });

  return { form, select, events };
}

function option(select: CeSelect, value: string): CeOption {
  return query<CeOption>(select, `ce-option[value='${value}']`);
}

function trigger(select: CeSelect): HTMLElement {
  return queryShadow<HTMLElement>(select, "[part='base']");
}

function display(select: CeSelect): string {
  return queryShadow(select, "[part='display']").textContent ?? "";
}

function isOpen(select: CeSelect): boolean {
  return queryShadow(select, "[part='listbox']").matches(":popover-open");
}

function highlighted(select: CeSelect): string | null {
  return trigger(select).ariaActiveDescendantElement?.getAttribute("value") ?? null;
}

/** Lets the select's MutationObserver run. */
function mutationsSettled(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function focusAndPress(select: CeSelect, keys: string): Promise<void> {
  trigger(select).focus();
  await userEvent.keyboard(keys);
}

/** `count` options named "Option 0", "Option 1", … with values "v0", "v1", … */
function manyOptions(count: number): string {
  let html = "";

  for (let i = 0; i < count; i++) {
    html += `<ce-option value="v${i}">Option ${i}</ce-option>`;
  }

  return html;
}

/** The selected-option spans in the display, as "value:text". */
function selectedSpans(select: CeSelect): string[] {
  const result: string[] = [];

  for (const span of select.shadowRoot?.querySelectorAll<HTMLElement>("[part='selected-option']") ??
    []) {
    result.push(`${span.dataset.value}:${span.textContent}`);
  }

  return result;
}

function selectedOptionValues(select: CeSelect): string[] {
  const result: string[] = [];

  for (const element of select.selectedOptions) {
    result.push(element.value);
  }

  return result;
}

type ShadowRendered = {
  host: HTMLElement;
  select: CeSelect;
  button: HTMLButtonElement;
};

/** A select and a button inside another element's shadow root. */
function renderInShadow(): ShadowRendered {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<ce-select name="fruit">${fruits}</ce-select><button type="button">Other</button>`;
  document.body.append(host);

  return { host, select: query(root, "ce-select"), button: query(root, "button") };
}

function accessibleNames(nodes: AccessibleNode[], role: string): string[] {
  const result: string[] = [];

  for (const node of nodes) {
    if (node.role === role) {
      result.push(node.name);
    }
  }

  return result;
}

describe("ce-select", () => {
  describe("options and value", () => {
    it("shows the placeholder and submits nothing without a selection", () => {
      const { form, select } = render(
        `<ce-select name="fruit" placeholder="Pick one">${fruits}</ce-select>`,
      );

      expect(select.value).toBe("");
      expect(display(select)).toBe("Pick one");
      expect(select.matches(":state(blank)")).toBe(true);
      expect(new FormData(form).has("fruit")).toBe(false);
    });

    it("selects the option marked selected", () => {
      const { form, select } = render(`
        <ce-select name="fruit">
          <ce-option value="apple">Apple</ce-option>
          <ce-option value="date" selected>Date</ce-option>
        </ce-select>
      `);

      expect(select.value).toBe("date");
      expect(display(select)).toBe("Date");
      expect(new FormData(form).get("fruit")).toBe("date");
      expect(option(select, "date").matches(":state(selected)")).toBe(true);
    });

    it("keeps a value set before options exist and labels it once they arrive", async () => {
      const { select } = render(`<ce-select name="fruit"></ce-select>`);

      select.value = "banana";
      expect(display(select)).toBe("banana");

      select.innerHTML = fruits;
      await mutationsSettled();

      expect(select.value).toBe("banana");
      expect(display(select)).toBe("Banana");
    });

    it("keeps the selection and its label when options are replaced", async () => {
      const { form, select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      select.value = "banana";
      select.innerHTML = `<ce-option value="kiwi">Kiwi</ce-option>`;
      await mutationsSettled();

      expect(select.value).toBe("banana");
      expect(display(select)).toBe("Banana");
      expect(new FormData(form).get("fruit")).toBe("banana");
    });

    it("updates the display when the selected option's text changes", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      select.value = "apple";

      const apple = option(select, "apple");
      const text = apple.firstChild;

      if (!(text instanceof Text)) {
        throw new Error("Expected the option's text node");
      }

      text.data = "Green apple";
      await mutationsSettled();

      expect(display(select)).toBe("Green apple");
    });

    it("doesn't fire events for programmatic changes", () => {
      const { select, events } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      select.value = "apple";

      expect(events).toEqual([]);
    });
  });

  describe("keyboard", () => {
    it("opens on ArrowDown, moves past disabled options and selects on Enter", async () => {
      const { select, events } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      await focusAndPress(select, "{ArrowDown}");

      expect(isOpen(select)).toBe(true);
      expect(highlighted(select)).toBe("apple");

      await userEvent.keyboard("{ArrowDown}{ArrowDown}");
      expect(highlighted(select)).toBe("date");

      await userEvent.keyboard("{Enter}");

      expect(isOpen(select)).toBe(false);
      expect(select.value).toBe("date");
      expect(events).toEqual(["input", "change"]);
    });

    it("opens at the selected option", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      select.value = "banana";
      await focusAndPress(select, "{Enter}");

      expect(highlighted(select)).toBe("banana");
    });

    it("opens at the first or last option on Home / End", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      await focusAndPress(select, "{End}");
      expect(highlighted(select)).toBe("date");

      await userEvent.keyboard("{Escape}{Home}");
      expect(highlighted(select)).toBe("apple");
    });

    it("closes on Escape without changing the value", async () => {
      const { select, events } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      await focusAndPress(select, "{ArrowDown}{ArrowDown}{Escape}");

      expect(isOpen(select)).toBe(false);
      expect(select.value).toBe("");
      expect(events).toEqual([]);
    });

    it("keeps Escape from reaching outer listeners while open", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);
      let escapes = 0;

      const countEscapes = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          escapes++;
        }
      };

      document.addEventListener("keydown", countEscapes);
      await focusAndPress(select, "{ArrowDown}{Escape}{Escape}");
      document.removeEventListener("keydown", countEscapes);

      // Only the second Escape (already closed) gets through.
      expect(escapes).toBe(1);
    });

    it("selects the highlighted option on Tab", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      await focusAndPress(select, "{ArrowDown}{ArrowDown}{Tab}");

      expect(select.value).toBe("banana");
      expect(isOpen(select)).toBe(false);
    });

    it("jumps to a typed label while closed and open", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      await focusAndPress(select, "d");

      expect(isOpen(select)).toBe(true);
      expect(highlighted(select)).toBe("date");

      await userEvent.keyboard("{Enter}");
      expect(select.value).toBe("date");
    });
  });

  describe("mouse", () => {
    it("toggles on the trigger and selects an option on release", async () => {
      const { select, events } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      await userEvent.click(trigger(select));
      expect(isOpen(select)).toBe(true);

      await userEvent.click(option(select, "banana"));

      expect(select.value).toBe("banana");
      expect(isOpen(select)).toBe(false);
      expect(events).toEqual(["input", "change"]);
      expect(select.shadowRoot?.activeElement).toBe(trigger(select));
    });

    it("ignores disabled options", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      await userEvent.click(trigger(select));
      await userEvent.click(option(select, "cherry"));

      expect(select.value).toBe("");
      expect(isOpen(select)).toBe(true);
    });

    it("highlights the option under the pointer", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      await userEvent.click(trigger(select));
      await userEvent.hover(option(select, "date"));

      expect(highlighted(select)).toBe("date");
    });

    it("closes when pressing outside", async () => {
      const { form, select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);
      const outside = document.createElement("button");
      outside.type = "button";
      outside.textContent = "Outside";
      form.append(outside);

      await userEvent.click(trigger(select));
      await userEvent.click(outside);

      expect(isOpen(select)).toBe(false);
    });
  });

  describe("form", () => {
    it("resets to the option marked selected", () => {
      const { form, select } = render(`
        <ce-select name="fruit">
          <ce-option value="apple">Apple</ce-option>
          <ce-option value="date" selected>Date</ce-option>
        </ce-select>
      `);

      select.value = "apple";
      form.reset();

      expect(select.value).toBe("date");
    });

    it("can't be opened and isn't submitted inside a disabled fieldset", async () => {
      const { form, select } = render(`
        <fieldset disabled>
          <ce-select name="fruit">
            <ce-option value="apple" selected>Apple</ce-option>
          </ce-select>
        </fieldset>
      `);

      await userEvent.click(trigger(select), { force: true });

      expect(isOpen(select)).toBe(false);
      expect(trigger(select).tabIndex).toBe(-1);
      expect(new FormData(form).has("fruit")).toBe(false);
    });
  });

  describe("accessibility", () => {
    it("is a combobox named by its label, controlling a named listbox", async () => {
      const { select } = render(`<ce-select name="fruit" label="Fruit">${fruits}</ce-select>`);

      await focusAndPress(select, "{ArrowDown}");

      const nodes = await accessibleNodeDetails();
      const roles: string[] = [];

      for (const node of nodes) {
        if (node.role === "combobox" || node.role === "listbox") {
          roles.push(`${node.role}:${node.name}`);
        }
      }

      expect(roles).toEqual(["combobox:Fruit", "listbox:Fruit"]);
      expect(trigger(select).ariaExpanded).toBe("true");
      expect(trigger(select).ariaActiveDescendantElement).toBe(option(select, "apple"));
    });
  });
  describe("more keyboard", () => {
    it("opens on ArrowUp, Space and Alt+ArrowDown", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      for (const keys of ["{ArrowUp}", " ", "{Alt>}{ArrowDown}{/Alt}"]) {
        await focusAndPress(select, keys);
        expect(isOpen(select), keys).toBe(true);

        await userEvent.keyboard("{Escape}");
        expect(isOpen(select), keys).toBe(false);
      }
    });

    it("moves by pages with PageDown / PageUp", async () => {
      const { select } = render(`<ce-select name="item">${manyOptions(25)}</ce-select>`);

      await focusAndPress(select, "{ArrowDown}{PageDown}");
      expect(highlighted(select)).toBe("v10");

      await userEvent.keyboard("{PageDown}{PageDown}");
      expect(highlighted(select)).toBe("v24");

      await userEvent.keyboard("{PageUp}");
      expect(highlighted(select)).toBe("v14");
    });

    it("selects and closes on Alt+ArrowUp", async () => {
      const { select, events } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      await focusAndPress(select, "{ArrowDown}{ArrowDown}{Alt>}{ArrowUp}{/Alt}");

      expect(select.value).toBe("banana");
      expect(isOpen(select)).toBe(false);
      expect(events).toEqual(["input", "change"]);
    });

    it("selects on Space while open", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      // Arrow keys don't start a type-ahead search, so Space selects.
      await focusAndPress(select, "{ArrowDown}{ArrowDown} ");

      expect(select.value).toBe("banana");
      expect(isOpen(select)).toBe(false);
    });

    it("treats Space as part of a type-ahead search in progress", async () => {
      const { select } = render(`
        <ce-select name="city">
          <ce-option>Newark</ce-option>
          <ce-option>New York</ce-option>
        </ce-select>
      `);

      await focusAndPress(select, "new");
      expect(highlighted(select)).toBe(null);
      expect(trigger(select).ariaActiveDescendantElement?.textContent).toBe("Newark");

      await userEvent.keyboard(" y");

      expect(isOpen(select)).toBe(true);
      expect(trigger(select).ariaActiveDescendantElement?.textContent).toBe("New York");
    });

    it("starts a new type-ahead search after a pause", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      // The select times keys with `event.timeStamp`; fake it instead of waiting.
      const timeStamp = vi.spyOn(Event.prototype, "timeStamp", "get");

      timeStamp.mockReturnValue(1000);
      await focusAndPress(select, "b");
      expect(highlighted(select)).toBe("banana");

      timeStamp.mockReturnValue(1600);
      await userEvent.keyboard("d");

      timeStamp.mockRestore();

      // Without the pause this would search for "bd" and stay on banana.
      expect(highlighted(select)).toBe("date");
    });

    it("ignores keys while disabled", async () => {
      const { select } = render(`<ce-select name="fruit" disabled>${fruits}</ce-select>`);

      trigger(select).focus();
      trigger(select).dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );

      expect(isOpen(select)).toBe(false);
    });
  });

  describe("more mouse and focus", () => {
    it("closes when the trigger is pressed again", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      await userEvent.click(trigger(select));
      await userEvent.click(trigger(select));

      expect(isOpen(select)).toBe(false);
    });

    it("ignores buttons other than the main one", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      await userEvent.click(trigger(select), { button: "right" });

      expect(isOpen(select)).toBe(false);
    });

    it("closes when focus moves elsewhere", async () => {
      const { form, select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);
      const other = document.createElement("input");
      form.append(other);

      await focusAndPress(select, "{ArrowDown}");
      other.focus();

      expect(isOpen(select)).toBe(false);
      expect(select.value).toBe("");
    });

    it("focuses the trigger when the label is clicked", async () => {
      const { select } = render(`<ce-select name="fruit" label="Fruit">${fruits}</ce-select>`);

      await userEvent.click(queryShadow(select, "[part='label']"));

      expect(select.shadowRoot?.activeElement).toBe(trigger(select));
    });

    it("doesn't fire events when re-selecting the selected option", async () => {
      const { select, events } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      await userEvent.click(trigger(select));
      await userEvent.click(option(select, "banana"));
      await userEvent.click(trigger(select));
      await userEvent.click(option(select, "banana"));

      expect(events).toEqual(["input", "change"]);
    });
  });

  describe("options changing at runtime", () => {
    it("can't select an option disabled after rendering", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      option(select, "date").disabled = true;
      await mutationsSettled();

      await focusAndPress(select, "{End}");
      expect(highlighted(select)).toBe("banana");

      await userEvent.click(option(select, "date"));
      expect(select.value).toBe("");
    });

    it("follows the selected attribute until the user picks a value", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      option(select, "banana").setAttribute("selected", "");
      await mutationsSettled();
      expect(select.value).toBe("banana");

      await userEvent.click(trigger(select));
      await userEvent.click(option(select, "apple"));

      option(select, "date").setAttribute("selected", "");
      await mutationsSettled();
      expect(select.value).toBe("apple");
    });

    it("keeps the selected value and label when the option's value changes", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      select.value = "apple";
      const apple = option(select, "apple");
      apple.value = "green-apple";
      await mutationsSettled();

      expect(select.value).toBe("apple");
      expect(display(select)).toBe("Apple");
      expect(apple.matches(":state(selected)")).toBe(false);
    });

    it("lets only the first of duplicate values be highlighted or selected", async () => {
      const { select } = render(`
        <ce-select name="letter">
          <ce-option value="a">First A</ce-option>
          <ce-option value="a">Second A</ce-option>
          <ce-option value="b">B</ce-option>
        </ce-select>
      `);
      const [first, second] = select.querySelectorAll("ce-option");

      await focusAndPress(select, "{ArrowDown}");
      expect(first?.matches(":state(highlighted)")).toBe(true);

      await userEvent.keyboard("{ArrowDown}");
      expect(highlighted(select)).toBe("b");
      expect(second?.matches(":state(highlighted)")).toBe(false);

      await userEvent.keyboard("{ArrowUp}{Enter}");
      expect(display(select)).toBe("First A");
      expect(first?.matches(":state(selected)")).toBe(true);
      expect(second?.matches(":state(selected)")).toBe(false);
    });

    it("moves the highlight when the highlighted option is removed while open", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      await focusAndPress(select, "{ArrowDown}{ArrowDown}");
      expect(highlighted(select)).toBe("banana");

      option(select, "banana").remove();
      await mutationsSettled();

      expect(highlighted(select)).toBe("apple");
      expect(isOpen(select)).toBe(true);
    });

    it("marks options highlighted and selected while navigating", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);
      const apple = option(select, "apple");
      const banana = option(select, "banana");

      await focusAndPress(select, "{ArrowDown}");
      expect(apple.matches(":state(highlighted)")).toBe(true);

      await userEvent.keyboard("{ArrowDown}");
      expect(apple.matches(":state(highlighted)")).toBe(false);
      expect(banana.matches(":state(highlighted)")).toBe(true);

      await userEvent.keyboard("{Enter}");
      expect(banana.matches(":state(selected)")).toBe(true);
      expect(banana.matches(":state(highlighted)")).toBe(false);
      expect(banana.selected).toBe(true);
    });
  });

  describe("lifecycle and attributes", () => {
    it("closes and stops listening outside when removed while open", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);
      const removeListener = vi.spyOn(document, "removeEventListener");

      await focusAndPress(select, "{ArrowDown}");
      select.remove();

      expect(isOpen(select)).toBe(false);
      expect(removeListener).toHaveBeenCalledWith("mousedown", expect.any(Function));

      removeListener.mockRestore();
    });

    it("is disabled by its own attribute and enabled again without it", async () => {
      const { form, select } = render(`<ce-select name="fruit" disabled>${fruits}</ce-select>`);

      select.value = "apple";

      expect(trigger(select).tabIndex).toBe(-1);
      expect(trigger(select).ariaDisabled).toBe("true");
      expect(new FormData(form).has("fruit")).toBe(false);

      await userEvent.click(trigger(select), { force: true });
      expect(isOpen(select)).toBe(false);

      select.disabled = false;

      expect(trigger(select).tabIndex).toBe(0);
      expect(trigger(select).ariaDisabled).toBe(null);
      expect(new FormData(form).get("fruit")).toBe("apple");
    });

    it("closes when disabled while open", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      await focusAndPress(select, "{ArrowDown}");
      select.disabled = true;

      expect(isOpen(select)).toBe(false);
    });

    it("follows placeholder and label changes", async () => {
      const { select } = render(
        `<ce-select name="fruit" label="Fruit" placeholder="Pick">${fruits}</ce-select>`,
      );

      select.placeholder = "Choose a fruit";
      select.label = "Favourite fruit";

      expect(display(select)).toBe("Choose a fruit");

      const names: string[] = [];

      for (const node of await accessibleNodeDetails()) {
        if (node.role === "combobox") {
          names.push(node.name);
        }
      }

      expect(names).toEqual(["Favourite fruit"]);
    });

    it("restores form state", () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      select.formStateRestoreCallback("date");

      expect(select.value).toBe("date");
      expect(display(select)).toBe("Date");
    });
  });

  describe("scrolling", () => {
    it("scrolls the list, not the page, to the highlighted option", async () => {
      const { select } = render(`<ce-select name="item">${manyOptions(50)}</ce-select>`);
      const listbox = queryShadow<HTMLElement>(select, "[part='listbox']");
      const pageScroll = document.scrollingElement?.scrollTop ?? 0;

      await focusAndPress(select, "{End}");

      const last = option(select, "v49").getBoundingClientRect();
      const list = listbox.getBoundingClientRect();

      expect(listbox.scrollTop).toBeGreaterThan(0);
      expect(last.bottom).toBeLessThanOrEqual(list.bottom + 1);
      expect(last.top).toBeGreaterThanOrEqual(list.top - 1);
      expect(document.scrollingElement?.scrollTop ?? 0).toBe(pageScroll);
    });
  });
  describe("selected-option spans", () => {
    it("wraps the selected label in a span in single mode", () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      select.value = "banana";

      expect(selectedSpans(select)).toEqual(["banana:Banana"]);
      expect(queryShadow<HTMLElement>(select, "[part='display']").title).toBe("Banana");
    });

    it("shows the placeholder without spans when nothing is selected", () => {
      const { select } = render(`<ce-select name="fruit" placeholder="Pick">${fruits}</ce-select>`);

      expect(selectedSpans(select)).toEqual([]);
      expect(display(select)).toBe("Pick");
    });

    it("uses the raw value for a value without an option", () => {
      const { select } = render(`<ce-select name="fruit" multiple>${fruits}</ce-select>`);

      select.values = ["apple", "mango"];

      expect(selectedSpans(select)).toEqual(["apple:Apple", "mango:mango"]);
    });
  });

  describe("multiple", () => {
    const multipleFruits = `
      <ce-option value="apple">Apple</ce-option>
      <ce-option value="banana" selected>Banana</ce-option>
      <ce-option value="cherry" disabled>Cherry</ce-option>
      <ce-option value="date" selected>Date</ce-option>
    `;

    it("starts with every option marked selected", () => {
      const { form, select } = render(
        `<ce-select name="fruit" multiple>${multipleFruits}</ce-select>`,
      );

      expect(select.values).toEqual(["banana", "date"]);
      expect(select.value).toBe("banana");
      expect(selectedSpans(select)).toEqual(["banana:Banana", "date:Date"]);
      expect(queryShadow<HTMLElement>(select, "[part='display']").title).toBe("Banana, Date");
      expect(new FormData(form).getAll("fruit")).toEqual(["banana", "date"]);
    });

    it("separates labels with commas from CSS", () => {
      const { select } = render(`<ce-select name="fruit" multiple>${multipleFruits}</ce-select>`);
      const spans = select.shadowRoot?.querySelectorAll("[part='selected-option']") ?? [];
      const [first, last] = spans;

      if (!first || !last) {
        throw new Error("Expected two spans");
      }

      expect(getComputedStyle(first, "::after").content).toBe('", "');
      expect(getComputedStyle(last, "::after").content).toBe("none");
    });

    it("toggles on Enter and Space and stays open", async () => {
      const { select, events } = render(`<ce-select name="fruit" multiple>${fruits}</ce-select>`);

      // Opens on apple; toggle it on, move to banana, toggle it on, back to apple, off.
      await focusAndPress(select, "{ArrowDown}{Enter}{ArrowDown} {ArrowUp}{Enter}");

      expect(isOpen(select)).toBe(true);
      expect(select.values).toEqual(["banana"]);
      expect(events).toEqual(["input", "change", "input", "change", "input", "change"]);
    });

    it("keeps the selection order of the user's toggles", async () => {
      const { select } = render(`<ce-select name="fruit" multiple>${fruits}</ce-select>`);

      await focusAndPress(select, "{End}{Enter}{Home}{Enter}");

      expect(select.values).toEqual(["date", "apple"]);
      expect(selectedSpans(select)).toEqual(["date:Date", "apple:Apple"]);
      expect(selectedOptionValues(select)).toEqual(["apple", "date"]);
    });

    it("closes on Tab and Alt+ArrowUp without toggling", async () => {
      const { select, events } = render(`<ce-select name="fruit" multiple>${fruits}</ce-select>`);

      await focusAndPress(select, "{ArrowDown}{Alt>}{ArrowUp}{/Alt}");
      expect(isOpen(select)).toBe(false);

      await userEvent.keyboard("{ArrowDown}{Tab}");
      expect(isOpen(select)).toBe(false);

      expect(select.values).toEqual([]);
      expect(events).toEqual([]);
    });

    it("toggles with the mouse, stays open and keeps focus on the trigger", async () => {
      const { select, events } = render(`<ce-select name="fruit" multiple>${fruits}</ce-select>`);

      await userEvent.click(trigger(select));
      await userEvent.click(option(select, "apple"));
      await userEvent.click(option(select, "date"));

      expect(isOpen(select)).toBe(true);
      expect(select.values).toEqual(["apple", "date"]);
      expect(select.shadowRoot?.activeElement).toBe(trigger(select));

      await userEvent.click(option(select, "apple"));

      expect(select.values).toEqual(["date"]);
      expect(events).toHaveLength(6);
    });

    it("marks the listbox multiselectable and shows check marks", async () => {
      const { select } = render(`<ce-select name="fruit" multiple>${multipleFruits}</ce-select>`);
      const listbox = queryShadow<HTMLElement>(select, "[part='listbox']");

      expect(listbox.ariaMultiSelectable).toBe("true");
      expect(option(select, "banana").matches(":state(checkable)")).toBe(true);
      expect(option(select, "banana").matches(":state(selected)")).toBe(true);

      const options: string[] = [];

      await focusAndPress(select, "{ArrowDown}");

      for (const node of await accessibleNodeDetails()) {
        if (node.role === "option" && node.selected) {
          options.push(node.name);
        }
      }

      expect(options).toEqual(["Banana", "Date"]);
    });

    it("keeps only the first value and hides check marks when multiple is turned off", () => {
      const { select } = render(`<ce-select name="fruit" multiple>${multipleFruits}</ce-select>`);
      const listbox = queryShadow<HTMLElement>(select, "[part='listbox']");

      select.multiple = false;

      expect(select.values).toEqual(["banana"]);
      expect(listbox.ariaMultiSelectable).toBe(null);
      expect(option(select, "banana").matches(":state(checkable)")).toBe(false);
    });

    it("submits under the current name and nothing without one", () => {
      const { form, select } = render(
        `<ce-select name="fruit" multiple>${multipleFruits}</ce-select>`,
      );

      select.name = "fruits";

      expect(new FormData(form).getAll("fruits")).toEqual(["banana", "date"]);
      expect(new FormData(form).has("fruit")).toBe(false);

      select.removeAttribute("name");

      expect([...new FormData(form).keys()]).toEqual([]);
    });

    it("resets to every option marked selected", () => {
      const { form, select } = render(
        `<ce-select name="fruit" multiple>${multipleFruits}</ce-select>`,
      );

      select.values = ["apple"];
      form.reset();

      expect(select.values).toEqual(["banana", "date"]);
    });

    it("restores form state from FormData", () => {
      const { select } = render(`<ce-select name="fruit" multiple>${fruits}</ce-select>`);
      const state = new FormData();
      state.append("fruit", "date");
      state.append("fruit", "apple");

      select.formStateRestoreCallback(state);

      expect(select.values).toEqual(["date", "apple"]);
    });
  });

  describe("values API", () => {
    it("sets and reads all values, including ones without an option", () => {
      const { select } = render(`<ce-select name="fruit" multiple>${fruits}</ce-select>`);

      select.values = ["date", "mango", "apple"];

      expect(select.values).toEqual(["date", "mango", "apple"]);
      expect(select.value).toBe("date");
      expect(selectedOptionValues(select)).toEqual(["apple", "date"]);
    });

    it("selects just one value through value", () => {
      const { select } = render(`<ce-select name="fruit" multiple>${fruits}</ce-select>`);

      select.values = ["date", "apple"];
      select.value = "banana";

      expect(select.values).toEqual(["banana"]);

      select.value = "";

      expect(select.values).toEqual([]);
    });

    it("keeps only the first of several values in single mode", () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      select.values = ["date", "apple"];

      expect(select.values).toEqual(["date"]);
      expect(selectedOptionValues(select)).toEqual(["date"]);
    });
  });
  describe("edge cases", () => {
    it("doesn't take focus from its label while disabled", async () => {
      const { select } = render(
        `<ce-select name="fruit" label="Fruit" disabled>${fruits}</ce-select>`,
      );

      await userEvent.click(queryShadow(select, "[part='label']"));

      expect(select.shadowRoot?.activeElement).toBe(null);
      expect(document.activeElement).not.toBe(select);
    });

    it("keeps tracking options after being removed and added back", async () => {
      const { form, select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      select.value = "apple";
      select.remove();
      form.append(select);

      const text = option(select, "apple").firstChild;

      if (!(text instanceof Text)) {
        throw new Error("Expected the option's text node");
      }

      text.data = "Green apple";
      await mutationsSettled();

      expect(display(select)).toBe("Green apple");
    });

    it("works inside another component's shadow root", async () => {
      const { select, button } = renderInShadow();

      // Pressing an option must not count as pressing outside.
      await userEvent.click(trigger(select));
      await userEvent.click(option(select, "banana"));
      expect(select.value).toBe("banana");

      // Pressing something else in the same shadow root closes.
      await userEvent.click(trigger(select));
      await userEvent.click(button);
      expect(isOpen(select)).toBe(false);

      // So does moving focus to it.
      await focusAndPress(select, "{ArrowDown}");
      button.focus();
      expect(isOpen(select)).toBe(false);
    });

    it("shows only the label of an option with a description", () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      select.value = "banana";

      expect(display(select)).toBe("Banana");
      expect(selectedSpans(select)).toEqual(["banana:Banana"]);
    });

    it("opens on Enter without submitting the form", async () => {
      const { form, select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);
      let submits = 0;

      form.addEventListener("submit", () => {
        submits++;
      });

      await focusAndPress(select, "{Enter}");

      expect(isOpen(select)).toBe(true);
      expect(submits).toBe(0);
    });

    it("ignores the pointer over disabled options and empty list space", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);
      const listbox = queryShadow<HTMLElement>(select, "[part='listbox']");

      await focusAndPress(select, "{ArrowDown}");
      await userEvent.hover(option(select, "cherry"));
      expect(highlighted(select)).toBe("apple");

      listbox.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
      expect(highlighted(select)).toBe("apple");
    });

    it("ignores other buttons and releases outside an option", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);
      const listbox = queryShadow<HTMLElement>(select, "[part='listbox']");

      await focusAndPress(select, "{ArrowDown}");

      option(select, "banana").dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, button: 2 }),
      );
      listbox.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));

      expect(select.value).toBe("");
      expect(isOpen(select)).toBe(true);
    });

    it("keeps the highlight when typing matches nothing", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      await focusAndPress(select, "{ArrowDown}{ArrowDown}z");

      expect(highlighted(select)).toBe("banana");
    });

    it("scrolls the list back up to the first option", async () => {
      const { select } = render(`<ce-select name="item">${manyOptions(50)}</ce-select>`);
      const listbox = queryShadow<HTMLElement>(select, "[part='listbox']");

      await focusAndPress(select, "{End}");
      expect(listbox.scrollTop).toBeGreaterThan(0);

      await userEvent.keyboard("{Home}");

      const first = option(select, "v0").getBoundingClientRect();
      const list = listbox.getBoundingClientRect();

      expect(first.top).toBeGreaterThanOrEqual(list.top - 1);
      expect(first.bottom).toBeLessThanOrEqual(list.bottom + 1);
    });

    it("names the combobox and listbox by a slotted label", async () => {
      const { select } = render(`
        <ce-select name="fruit">
          <span slot="label">Favourite <b>fruit</b></span>
          ${fruits}
        </ce-select>
      `);

      await focusAndPress(select, "{ArrowDown}");

      const nodes = await accessibleNodeDetails();

      expect(accessibleNames(nodes, "combobox")).toEqual(["Favourite fruit"]);
      expect(accessibleNames(nodes, "listbox")).toEqual(["Favourite fruit"]);
    });

    it("sends input, but not change, out of a surrounding shadow root, like native", async () => {
      const { host, select } = renderInShadow();
      const events: string[] = [];

      host.addEventListener("input", () => {
        events.push("input");
      });

      host.addEventListener("change", () => {
        events.push("change");
      });

      await userEvent.click(trigger(select));
      await userEvent.click(option(select, "apple"));

      expect(events).toEqual(["input"]);
    });

    it("closes on Escape inside a modal dialog without closing the dialog", async () => {
      const dialog = document.createElement("dialog");
      dialog.innerHTML = `<ce-select name="fruit">${fruits}</ce-select>`;
      document.body.append(dialog);
      dialog.showModal();

      const select = query(dialog, "ce-select");

      await focusAndPress(select, "{ArrowDown}{Escape}");

      expect(isOpen(select)).toBe(false);
      expect(dialog.open).toBe(true);

      await userEvent.keyboard("{Escape}");

      expect(dialog.open).toBe(false);
    });

    it("submits a single value under a changed name", () => {
      const { form, select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      select.value = "apple";
      select.name = "favourite";

      expect(new FormData(form).get("favourite")).toBe("apple");
      expect(new FormData(form).has("fruit")).toBe(false);
    });

    it("clears the display title when the last value is deselected", async () => {
      const { select } = render(`<ce-select name="fruit" multiple>${fruits}</ce-select>`);
      const displayPart = queryShadow<HTMLElement>(select, "[part='display']");

      await focusAndPress(select, "{ArrowDown}{Enter}");
      expect(displayPart.title).toBe("Apple");

      await userEvent.keyboard("{Enter}");
      expect(displayPart.title).toBe("");
    });

    it("updates an option's accessible name when its text is edited", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);
      const text = option(select, "apple").firstChild;

      if (!(text instanceof Text)) {
        throw new Error("Expected the option's text node");
      }

      await focusAndPress(select, "{ArrowDown}");

      text.data = "Green apple";
      await mutationsSettled();

      expect(accessibleNames(await accessibleNodeDetails(), "option")[0]).toBe("Green apple");
    });
  });
});
