import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";
import { accessibleNodeDetails, withRole } from "../core/test-accessibility.ts";
import { axeViolations } from "../core/test-axe.ts";
import type { AccessibleNode } from "../core/test-accessibility.ts";
import { query, queryShadow } from "../core/test-dom.ts";
import "./ce-select.ts";
import { CeOption } from "./ce-option.ts";
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

/** Records which options `setView` is called on. */
function spyOnSetView() {
  const spy = vi.spyOn(CeOption.prototype, "setView");

  return {
    /** Values of the options updated since the last call, in order. */
    takeValues(): string[] {
      const values: string[] = [];

      for (const context of spy.mock.contexts) {
        values.push((context as CeOption).value);
      }

      spy.mockClear();

      return values;
    },
    restore(): void {
      spy.mockRestore();
    },
  };
}

/** Dispatches a primary-button pointer event, from a mouse or a touch. */
function pointer(target: Element, type: string, pointerType = "mouse"): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      composed: true,
      button: 0,
      isPrimary: true,
      pointerType,
    }),
  );
}

function searchInput(select: CeSelect): HTMLInputElement {
  return queryShadow<HTMLInputElement>(select, "[part='input']");
}

/** Values of options not hidden by the search filter. */
function shownValues(select: CeSelect): string[] {
  const result: string[] = [];

  for (const element of select.querySelectorAll("ce-option")) {
    if (!element.matches(":state(filtered-out)")) {
      result.push(element.value);
    }
  }

  return result;
}

async function focusAndType(select: CeSelect, keys: string): Promise<void> {
  searchInput(select).focus();
  await userEvent.keyboard(keys);
}

/** Waits for the select's scroll, which runs on the next animation frame. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
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

  describe("pointer events", () => {
    it("toggles on a mouse press, before release", () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      pointer(trigger(select), "pointerdown");
      expect(isOpen(select)).toBe(true);
      expect(select.shadowRoot?.activeElement).toBe(trigger(select));

      pointer(trigger(select), "pointerdown");
      expect(isOpen(select)).toBe(false);
    });

    it("touch toggles on release, so a swipe starting on the field can scroll the page", () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      pointer(trigger(select), "pointerdown", "touch");
      expect(isOpen(select)).toBe(false);

      pointer(trigger(select), "pointerup", "touch");
      expect(isOpen(select)).toBe(true);
      expect(select.shadowRoot?.activeElement).toBe(trigger(select));

      pointer(trigger(select), "pointerdown", "touch");
      pointer(trigger(select), "pointerup", "touch");
      expect(isOpen(select)).toBe(false);
    });

    it("touch doesn't open when the browser takes the touch for scrolling", () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      pointer(trigger(select), "pointerdown", "touch");
      pointer(trigger(select), "pointercancel", "touch");

      expect(isOpen(select)).toBe(false);
    });

    it("a mouse release on the trigger doesn't toggle again", () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      pointer(trigger(select), "pointerdown");
      pointer(trigger(select), "pointerup");

      expect(isOpen(select)).toBe(true);
    });

    it("selects an option on a touch release", async () => {
      const { select, events } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      await focusAndPress(select, "{ArrowDown}");
      pointer(option(select, "banana"), "pointerup", "touch");

      expect(select.value).toBe("banana");
      expect(isOpen(select)).toBe(false);
      expect(events).toEqual(["input", "change"]);
    });

    it("toggles an option on a touch release in multiple mode", async () => {
      const { select } = render(`<ce-select name="fruit" multiple>${fruits}</ce-select>`);

      await focusAndPress(select, "{ArrowDown}");
      pointer(option(select, "banana"), "pointerup", "touch");
      pointer(option(select, "date"), "pointerup", "touch");

      expect(select.values).toEqual(["banana", "date"]);
      expect(isOpen(select)).toBe(true);
    });

    it("closes when a touch presses outside", async () => {
      const { form, select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);
      const outside = document.createElement("p");
      form.append(outside);

      await focusAndPress(select, "{ArrowDown}");
      pointer(outside, "pointerdown", "touch");

      expect(isOpen(select)).toBe(false);
    });

    it("pressing the clear button doesn't toggle the list", () => {
      const { select } = render(`<ce-select name="fruit" with-clear>${fruits}</ce-select>`);

      select.value = "banana";
      pointer(queryShadow(select, "[part='clear-button']"), "pointerdown");
      pointer(queryShadow(select, "[part='clear-button']"), "pointerup", "touch");

      expect(isOpen(select)).toBe(false);
    });

    it("searchable: a touch on the input opens on release", () => {
      const { select } = render(`<ce-select name="fruit" searchable>${fruits}</ce-select>`);

      pointer(searchInput(select), "pointerdown", "touch");
      expect(isOpen(select)).toBe(false);

      pointer(searchInput(select), "pointerup", "touch");
      expect(isOpen(select)).toBe(true);

      // Tapping the input again is for placing the caret: it stays open.
      pointer(searchInput(select), "pointerup", "touch");
      expect(isOpen(select)).toBe(true);
    });

    it("ignores a disabled select", () => {
      const { select } = render(`<ce-select name="fruit" disabled>${fruits}</ce-select>`);

      pointer(trigger(select), "pointerdown");
      pointer(trigger(select), "pointerup", "touch");

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

    describe("tree by state", () => {
      it("closed and empty: collapsed, no listbox or options", async () => {
        const { select } = render(
          `<ce-select name="fruit" label="Fruit" placeholder="Pick one">${fruits}</ce-select>`,
        );
        trigger(select).focus();

        const nodes = await accessibleNodeDetails();

        expect(withRole(nodes, "combobox")).toMatchObject([
          { name: "Fruit", expanded: false, hasPopup: "listbox", focused: true },
        ]);
        expect(withRole(nodes, "listbox")).toEqual([]);
        expect(withRole(nodes, "option")).toEqual([]);
      });

      it("closed with a value: the selected label is the value", async () => {
        const { select } = render(`<ce-select name="fruit" label="Fruit">${fruits}</ce-select>`);
        select.value = "date";

        const [combobox] = withRole(await accessibleNodeDetails(), "combobox");

        expect(combobox).toMatchObject({ name: "Fruit", value: "Date", expanded: false });
      });

      it("open: expanded, controlling the listbox, with the highlighted option active", async () => {
        const { select } = render(`<ce-select name="fruit" label="Fruit">${fruits}</ce-select>`);
        select.value = "banana";

        await focusAndPress(select, "{ArrowDown}");

        const nodes = await accessibleNodeDetails();
        const options: string[] = [];

        for (const node of withRole(nodes, "option")) {
          options.push(
            `${node.name}${node.selected ? " (selected)" : ""}${node.disabled ? " (disabled)" : ""}`,
          );
        }

        expect(withRole(nodes, "combobox")).toMatchObject([
          {
            value: "Banana",
            expanded: true,
            focused: true,
            controls: ["listbox:Fruit"],
            activeDescendant: "option:Banana",
          },
        ]);
        expect(withRole(nodes, "listbox")).toMatchObject([
          { name: "Fruit", multiselectable: false },
        ]);
        expect(options).toEqual(["Apple", "Banana (selected)", "Cherry (disabled)", "Date"]);
      });

      it("disabled by its attribute or a fieldset", async () => {
        render(`
          <ce-select name="own" label="Own" disabled>${fruits}</ce-select>
          <fieldset disabled><ce-select name="inherited" label="Inherited">${fruits}</ce-select></fieldset>
        `);

        const comboboxes = withRole(await accessibleNodeDetails(), "combobox");

        expect(comboboxes).toMatchObject([
          { name: "Own", disabled: true, expanded: false },
          { name: "Inherited", disabled: true, expanded: false },
        ]);
      });

      it("multiple: the selected labels are the value, the listbox is multiselectable", async () => {
        const { select } = render(
          `<ce-select name="fruit" label="Fruit" multiple>${fruits}</ce-select>`,
        );
        select.values = ["banana", "date"];

        await focusAndPress(select, "{ArrowDown}");

        const nodes = await accessibleNodeDetails();
        const selected: string[] = [];

        for (const node of withRole(nodes, "option")) {
          if (node.selected) {
            selected.push(node.name);
          }
        }

        expect(withRole(nodes, "combobox")).toMatchObject([
          { value: "Banana, Date", expanded: true },
        ]);
        expect(withRole(nodes, "listbox")).toMatchObject([{ multiselectable: true }]);
        expect(selected).toEqual(["Banana", "Date"]);
      });

      it("searchable: the input is the only combobox, with list autocomplete", async () => {
        const { select } = render(
          `<ce-select name="fruit" label="Fruit" searchable>${fruits}</ce-select>`,
        );
        select.value = "banana";
        searchInput(select).focus();

        const nodes = await accessibleNodeDetails();

        expect(withRole(nodes, "combobox")).toMatchObject([
          {
            name: "Fruit",
            value: "Banana",
            autocomplete: "list",
            hasPopup: "listbox",
            expanded: false,
            focused: true,
          },
        ]);
      });

      it("searchable: filtered-out options leave the tree", async () => {
        const { select } = render(
          `<ce-select name="fruit" label="Fruit" searchable>${fruits}</ce-select>`,
        );

        await focusAndType(select, "an");

        const nodes = await accessibleNodeDetails();
        const options: string[] = [];

        for (const node of withRole(nodes, "option")) {
          options.push(node.name);
        }

        expect(withRole(nodes, "combobox")).toMatchObject([
          { value: "an", expanded: true, activeDescendant: "option:Banana" },
        ]);
        expect(options).toEqual(["Banana"]);
      });

      it("searchable: the result count is in a polite live region", async () => {
        const { select } = render(
          `<ce-select name="fruit" label="Fruit" searchable>${fruits}</ce-select>`,
        );

        await focusAndType(select, "an");

        let live = 0;

        for (const node of await accessibleNodeDetails()) {
          if (node.live === "polite") {
            live++;
          }
        }

        expect(live).toBeGreaterThan(0);
      });

      it("keeps every option of a long list in the tree, scrolled out of view or not", async () => {
        const { select } = render(
          `<ce-select name="items" label="Items" searchable>${manyOptions(2000)}</ce-select>`,
        );

        await focusAndType(select, "Option 1");

        const nodes = await accessibleNodeDetails();

        // "Option 1", "Option 10"–"Option 19", "Option 100"–"Option 199", "Option 1000"–"Option 1999".
        expect(withRole(nodes, "option")).toHaveLength(1111);
        expect(withRole(nodes, "combobox")).toMatchObject([
          { activeDescendant: "option:Option 1" },
        ]);
      });
    });

    describe("no stray nodes", () => {
      it("exposes only the combobox, the clear button and the list", async () => {
        const { select } = render(
          `<ce-select name="fruit" label="Fruit" with-clear multiple>${fruits}</ce-select>`,
        );
        select.values = ["banana"];

        await focusAndPress(select, "{ArrowDown}");

        const roles: string[] = [];

        for (const node of await accessibleNodeDetails()) {
          // Structure without semantics of its own.
          if (["RootWebArea", "generic", "none", "LabelText", "form"].includes(node.role)) {
            continue;
          }

          if (node.role === "option") {
            continue;
          }

          roles.push(`${node.role}:${node.name}`);
        }

        // No icons (chevron, check marks), no "No results" row.
        expect(roles).toEqual(["combobox:Fruit", "listbox:Fruit", "button:Clear"]);
      });
    });

    describe("axe", () => {
      // An option's name is its label; the description slot is exposed as
      // its description instead, so the visible text is more than the name.
      const ignored = ["label-content-name-mismatch"];

      it("finds nothing when closed, empty or with a value", async () => {
        const { form } = render(`
          <ce-select name="empty" label="Empty" placeholder="Pick one">${fruits}</ce-select>
          <ce-select name="fruit" label="Fruit" with-clear>${fruits}</ce-select>
        `);
        query<CeSelect>(form, "[name='fruit']").value = "banana";

        expect(await axeViolations(form, ignored)).toEqual([]);
      });

      it("finds nothing while open", async () => {
        const { form, select } = render(
          `<ce-select name="fruit" label="Fruit">${fruits}</ce-select>`,
        );

        await focusAndPress(select, "{ArrowDown}");

        expect(await axeViolations(form, ignored)).toEqual([]);
      });

      it("finds nothing while open in multiple mode", async () => {
        const { form, select } = render(
          `<ce-select name="fruit" label="Fruit" multiple with-clear>${fruits}</ce-select>`,
        );
        select.values = ["banana", "date"];

        await focusAndPress(select, "{ArrowDown}");

        expect(await axeViolations(form, ignored)).toEqual([]);
      });

      it("finds nothing while searching, with and without results", async () => {
        const { form, select } = render(
          `<ce-select name="fruit" label="Fruit" searchable multiple>${fruits}</ce-select>`,
        );
        select.values = ["date"];

        await focusAndType(select, "an");
        expect(await axeViolations(form, ignored)).toEqual([]);

        await userEvent.keyboard("zz");
        expect(await axeViolations(form, ignored)).toEqual([]);
      });

      it("finds nothing when disabled", async () => {
        const { form } = render(
          `<ce-select name="fruit" label="Fruit" disabled>${fruits}</ce-select>`,
        );

        expect(await axeViolations(form, ignored)).toEqual([]);
      });
    });

    // Found by the tests above; `it.fails` until fixed, so the suite stays green
    // and a fix shows up as a failure to flip to `it`.
    describe("known gaps", () => {
      // The placeholder text sits in the box, so it's read as the value.
      it.fails("closed and empty: no value, not the placeholder", async () => {
        const { select } = render(
          `<ce-select name="fruit" label="Fruit" placeholder="Pick one">${fruits}</ce-select>`,
        );
        trigger(select).focus();

        const [combobox] = withRole(await accessibleNodeDetails(), "combobox");

        expect(combobox?.value).toBe("");
      });

      // With focus in the input, the selected values (shown before it) aren't
      // tied to the combobox, so a screen reader doesn't hear the selection.
      it.fails("searchable multiple: the selection is announced with the combobox", async () => {
        const { select } = render(
          `<ce-select name="fruit" label="Fruit" searchable multiple>${fruits}</ce-select>`,
        );
        select.values = ["banana", "date"];
        searchInput(select).focus();

        const [combobox] = withRole(await accessibleNodeDetails(), "combobox");
        const announced = `${combobox?.value ?? ""} ${combobox?.description ?? ""}`;

        expect(announced).toContain("Banana");
        expect(announced).toContain("Date");
      });
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
      expect(removeListener).toHaveBeenCalledWith("pointerdown", expect.any(Function));

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
      await nextFrame();

      const last = option(select, "v49").getBoundingClientRect();
      const list = listbox.getBoundingClientRect();

      expect(listbox.scrollTop).toBeGreaterThan(0);
      expect(last.bottom).toBeLessThanOrEqual(list.bottom + 1);
      expect(last.top).toBeGreaterThanOrEqual(list.top - 1);
      expect(document.scrollingElement?.scrollTop ?? 0).toBe(pageScroll);
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
        new PointerEvent("pointerup", { bubbles: true, button: 2 }),
      );
      listbox.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));

      expect(select.value).toBe("");
      expect(isOpen(select)).toBe(true);
    });

    it("keeps the highlight when typing matches nothing", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      await focusAndPress(select, "{ArrowDown}{ArrowDown}z");

      expect(highlighted(select)).toBe("banana");
    });

    it("doesn't measure layout while handling keys, and scrolls once per frame", async () => {
      const { select } = render(`<ce-select name="item">${manyOptions(50)}</ce-select>`);
      const listbox = queryShadow<HTMLElement>(select, "[part='listbox']");

      await focusAndPress(select, "{ArrowDown}");
      await nextFrame();

      const measure = vi.spyOn(listbox, "getBoundingClientRect");

      // Three highlight moves in one task.
      for (const key of ["End", "Home", "End"]) {
        trigger(select).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      }

      expect(measure).not.toHaveBeenCalled();

      await nextFrame();

      expect(measure).toHaveBeenCalledTimes(1);
      expect(listbox.scrollTop).toBeGreaterThan(0);

      measure.mockRestore();
    });

    it("doesn't scroll after being removed", async () => {
      const { select } = render(`<ce-select name="item">${manyOptions(50)}</ce-select>`);
      const listbox = queryShadow<HTMLElement>(select, "[part='listbox']");

      await focusAndPress(select, "{ArrowDown}");
      await nextFrame();

      const measure = vi.spyOn(listbox, "getBoundingClientRect");

      trigger(select).dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
      select.remove();
      await nextFrame();

      expect(measure).not.toHaveBeenCalled();

      measure.mockRestore();
    });

    it("scrolls the list back up to the first option", async () => {
      const { select } = render(`<ce-select name="item">${manyOptions(50)}</ce-select>`);
      const listbox = queryShadow<HTMLElement>(select, "[part='listbox']");

      await focusAndPress(select, "{End}");
      await nextFrame();
      expect(listbox.scrollTop).toBeGreaterThan(0);

      await userEvent.keyboard("{Home}");
      await nextFrame();

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
  describe("rendering cost", () => {
    it("updates only the old and new option when the highlight moves", async () => {
      const { select } = render(`<ce-select name="item">${manyOptions(2000)}</ce-select>`);
      const views = spyOnSetView();

      await focusAndPress(select, "{ArrowDown}");
      expect(views.takeValues()).toEqual(["v0"]);

      await userEvent.keyboard("{ArrowDown}");
      expect(views.takeValues()).toEqual(["v0", "v1"]);

      await userEvent.keyboard("{End}");
      expect(views.takeValues()).toEqual(["v1", "v1999"]);

      await userEvent.hover(option(select, "v1998"));
      expect(views.takeValues()).toEqual(["v1999", "v1998"]);

      views.restore();
    });

    it("updates only the old and new selected option in single mode", async () => {
      const { select } = render(`<ce-select name="item">${manyOptions(50)}</ce-select>`);

      await focusAndPress(select, "{ArrowDown}{ArrowDown}");

      const views = spyOnSetView();

      // Selects v1; closing also clears its highlight.
      await userEvent.keyboard("{Enter}");
      expect(new Set(views.takeValues())).toEqual(new Set(["v1"]));

      // Opens on v1, moves to v2, selects it.
      await userEvent.keyboard("{Enter}{ArrowDown}");
      views.takeValues();

      await userEvent.keyboard("{Enter}");
      expect(new Set(views.takeValues())).toEqual(new Set(["v1", "v2"]));

      views.restore();
    });

    it("updates only the toggled option in multiple mode", async () => {
      const { select } = render(`<ce-select name="item" multiple>${manyOptions(50)}</ce-select>`);

      await focusAndPress(select, "{ArrowDown}");

      const views = spyOnSetView();

      await userEvent.keyboard("{Enter}");
      expect(views.takeValues()).toEqual(["v0"]);

      select.values = ["v0", "v7"];
      expect(views.takeValues()).toEqual(["v7"]);

      views.restore();
    });

    it("updates every option when multiple changes or the options change", async () => {
      const { select } = render(`<ce-select name="item">${manyOptions(50)}</ce-select>`);
      const views = spyOnSetView();

      select.multiple = true;
      expect(views.takeValues()).toHaveLength(50);

      select.append(document.createElement("ce-option"));
      await mutationsSettled();
      expect(views.takeValues()).toHaveLength(51);

      views.restore();
    });

    it("leaves duplicate elements alone while navigating", async () => {
      const { select } = render(`
        <ce-select name="letter">
          <ce-option value="a">First A</ce-option>
          <ce-option value="a">Second A</ce-option>
          <ce-option value="b">B</ce-option>
        </ce-select>
      `);
      const second = select.querySelectorAll("ce-option")[1];
      const spy = vi.spyOn(CeOption.prototype, "setView");

      await focusAndPress(select, "{ArrowDown}{ArrowDown}{ArrowUp}{Enter}");

      expect(spy.mock.contexts).not.toContain(second);

      spy.mockRestore();
    });

    it("looks up selectedOptions without searching the DOM", () => {
      const { select } = render(`<ce-select name="item" multiple>${manyOptions(50)}</ce-select>`);
      const querySelectorAll = vi.spyOn(select, "querySelectorAll");

      select.values = ["v3", "v1"];

      expect(selectedOptionValues(select)).toEqual(["v1", "v3"]);
      expect(querySelectorAll).not.toHaveBeenCalled();

      querySelectorAll.mockRestore();
    });
  });
  describe("searchable", () => {
    it("makes the input the combobox, named by the label", async () => {
      const { select } = render(
        `<ce-select name="fruit" label="Fruit" searchable>${fruits}</ce-select>`,
      );
      const input = searchInput(select);

      expect(input.hidden).toBe(false);
      expect(input.getAttribute("role")).toBe("combobox");
      expect(input.ariaAutoComplete).toBe("list");
      expect(trigger(select).hasAttribute("role")).toBe(false);
      expect(trigger(select).hasAttribute("tabindex")).toBe(false);

      await focusAndType(select, "{ArrowDown}");

      const nodes = await accessibleNodeDetails();

      expect(accessibleNames(nodes, "combobox")).toEqual(["Fruit"]);
      expect(input.ariaExpanded).toBe("true");
      expect(input.ariaActiveDescendantElement).toBe(option(select, "apple"));
    });

    it("filters case-insensitively and highlights the first match while typing", async () => {
      const { select } = render(`<ce-select name="fruit" searchable>${fruits}</ce-select>`);

      await focusAndType(select, "A");

      expect(isOpen(select)).toBe(true);
      expect(shownValues(select)).toEqual(["apple", "banana", "date"]);
      expect(searchInput(select).ariaActiveDescendantElement).toBe(option(select, "apple"));

      await userEvent.keyboard("N");

      expect(shownValues(select)).toEqual(["banana"]);
      expect(searchInput(select).ariaActiveDescendantElement).toBe(option(select, "banana"));

      await userEvent.keyboard("{Backspace}{Backspace}");

      expect(shownValues(select)).toEqual(["apple", "banana", "cherry", "date"]);
    });

    it("fires search on every edit, but not input or change", async () => {
      const { select, events } = render(`<ce-select name="fruit" searchable>${fruits}</ce-select>`);
      const queries: string[] = [];

      select.addEventListener("search", (event) => {
        queries.push(event.detail.query);
      });

      await focusAndType(select, "ba{Backspace}");

      expect(queries).toEqual(["b", "ba", "b"]);
      expect(events).toEqual([]);
    });

    it("selects on Enter and shows the label in the input", async () => {
      const { select, events } = render(`<ce-select name="fruit" searchable>${fruits}</ce-select>`);

      await focusAndType(select, "dat{Enter}");

      expect(select.value).toBe("date");
      expect(isOpen(select)).toBe(false);
      expect(searchInput(select).value).toBe("Date");
      expect(shownValues(select)).toEqual(["apple", "banana", "cherry", "date"]);
      expect(events).toEqual(["input", "change"]);
    });

    it("shows a no-results row when nothing matches", async () => {
      const { select } = render(`<ce-select name="fruit" searchable>${fruits}</ce-select>`);
      const noResults = queryShadow<HTMLElement>(select, "[part='no-results']");

      expect(noResults.hidden).toBe(true);

      await focusAndType(select, "zz");

      expect(noResults.hidden).toBe(false);
      expect(shownValues(select)).toEqual([]);
      expect(searchInput(select).ariaActiveDescendantElement).toBe(null);

      await userEvent.keyboard("{Backspace}{Backspace}");

      expect(noResults.hidden).toBe(true);
    });

    it("types Space and keeps Home / End for the caret", async () => {
      const { select } = render(`
        <ce-select name="city" searchable>
          <ce-option>Newark</ce-option>
          <ce-option>New York</ce-option>
          <ce-option>Nice</ce-option>
        </ce-select>
      `);
      const input = searchInput(select);

      await focusAndType(select, "new y");

      expect(input.value).toBe("new y");
      expect(shownValues(select)).toEqual(["New York"]);

      await userEvent.keyboard("{Home}");

      expect(input.selectionStart).toBe(0);
      expect(input.ariaActiveDescendantElement?.textContent).toBe("New York");

      await userEvent.keyboard("{End}");

      expect(input.selectionStart).toBe(5);
    });

    it("closes on Escape and puts the selected label back", async () => {
      const { select } = render(`<ce-select name="fruit" searchable>${fruits}</ce-select>`);

      select.value = "banana";
      await focusAndType(select, "zz{Escape}");

      expect(isOpen(select)).toBe(false);
      expect(select.value).toBe("banana");
      expect(searchInput(select).value).toBe("Banana");
    });

    it("selects its text on focus, so typing replaces the label", async () => {
      const { select } = render(`<ce-select name="fruit" searchable>${fruits}</ce-select>`);
      const input = searchInput(select);

      select.value = "banana";
      input.focus();

      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe("Banana".length);
    });

    it("clears the selection when the text is erased and focus leaves", async () => {
      const { form, select, events } = render(
        `<ce-select name="fruit" searchable>${fruits}</ce-select>`,
      );
      const other = document.createElement("input");
      form.append(other);

      select.value = "banana";
      await focusAndType(select, "{Backspace}");
      other.focus();

      expect(select.value).toBe("");
      expect(searchInput(select).value).toBe("");
      expect(events).toEqual(["input", "change"]);
    });

    it("keeps the selection and restores the label when other text is left", async () => {
      const { form, select } = render(`<ce-select name="fruit" searchable>${fruits}</ce-select>`);
      const other = document.createElement("input");
      form.append(other);

      select.value = "banana";
      await focusAndType(select, "zz");
      other.focus();

      expect(select.value).toBe("banana");
      expect(searchInput(select).value).toBe("Banana");
    });

    it("submits the form on Enter while closed", async () => {
      const { form, select } = render(`<ce-select name="fruit" searchable>${fruits}</ce-select>`);
      let submits = 0;

      form.addEventListener("submit", () => {
        submits++;
      });

      await focusAndType(select, "{Enter}");

      expect(submits).toBe(1);
      expect(isOpen(select)).toBe(false);
    });

    it("opens when the input is pressed and toggles from the chevron", async () => {
      const { select } = render(`<ce-select name="fruit" searchable>${fruits}</ce-select>`);

      await userEvent.click(searchInput(select));
      expect(isOpen(select)).toBe(true);
      expect(select.shadowRoot?.activeElement).toBe(searchInput(select));

      // Pressing the input again keeps it open (it's for placing the caret).
      await userEvent.click(searchInput(select));
      expect(isOpen(select)).toBe(true);

      await userEvent.click(queryShadow(select, "[part='chevron']"));
      expect(isOpen(select)).toBe(false);
      expect(select.shadowRoot?.activeElement).toBe(searchInput(select));
    });

    it("doesn't filter with no-filter, so the app can load matching options", async () => {
      const { select } = render(
        `<ce-select name="fruit" searchable no-filter>${fruits}</ce-select>`,
      );

      select.value = "banana";

      select.addEventListener("search", (event) => {
        // Stand-in for a server search: replace the options.
        select.innerHTML = `<ce-option value="${event.detail.query}">Result for ${event.detail.query}</ce-option>`;
      });

      await focusAndType(select, "kiwi");
      await mutationsSettled();

      expect(shownValues(select)).toEqual(["kiwi"]);
      expect(select.value).toBe("banana");

      await userEvent.keyboard("{Escape}");

      // The selection outlived its option, label included.
      expect(searchInput(select).value).toBe("Banana");
    });

    it("keeps the spans before an empty input in multiple mode", async () => {
      const { select } = render(`
        <ce-select name="fruit" searchable multiple placeholder="Pick fruit">${fruits}</ce-select>
      `);
      const input = searchInput(select);

      expect(input.placeholder).toBe("Pick fruit");

      await focusAndType(select, "an{Enter}");

      expect(select.values).toEqual(["banana"]);
      expect(selectedSpans(select)).toEqual(["banana:Banana"]);
      expect(isOpen(select)).toBe(true);
      expect(input.value).toBe("");
      expect(input.placeholder).toBe("");

      await userEvent.keyboard("{Escape}");

      expect(input.value).toBe("");
      expect(selectedSpans(select)).toEqual(["banana:Banana"]);
    });

    it("multiple: picking with Enter clears the search and shows every option", async () => {
      const { select } = render(
        `<ce-select name="fruit" searchable multiple>${fruits}</ce-select>`,
      );

      await focusAndType(select, "ban{Enter}");

      expect(select.values).toEqual(["banana"]);
      expect(searchInput(select).value).toBe("");
      expect(shownValues(select)).toEqual(["apple", "banana", "cherry", "date"]);
      expect(isOpen(select)).toBe(true);
      expect(option(select, "banana").matches(":state(highlighted)")).toBe(true);
    });

    it("multiple: picking with a click clears the search and keeps focus in the input", async () => {
      const { select } = render(
        `<ce-select name="fruit" searchable multiple>${fruits}</ce-select>`,
      );

      await focusAndType(select, "ate");
      await userEvent.click(option(select, "date"));

      expect(select.values).toEqual(["date"]);
      expect(searchInput(select).value).toBe("");
      expect(shownValues(select)).toEqual(["apple", "banana", "cherry", "date"]);
      expect(isOpen(select)).toBe(true);
      expect(select.shadowRoot?.activeElement).toBe(searchInput(select));
    });

    it("multiple: unticking keeps the search", async () => {
      const { select } = render(
        `<ce-select name="fruit" searchable multiple>${fruits}</ce-select>`,
      );

      select.values = ["banana"];
      await focusAndType(select, "ban{Enter}");

      expect(select.values).toEqual([]);
      expect(searchInput(select).value).toBe("ban");
      expect(shownValues(select)).toEqual(["banana"]);
    });

    it("can be switched on and off at runtime", async () => {
      const { select } = render(`<ce-select name="fruit" label="Fruit">${fruits}</ce-select>`);
      const input = searchInput(select);

      select.value = "date";
      trigger(select).focus();
      select.searchable = true;

      expect(input.hidden).toBe(false);
      expect(input.getAttribute("role")).toBe("combobox");
      expect(input.value).toBe("Date");
      expect(trigger(select).hasAttribute("role")).toBe(false);
      expect(select.shadowRoot?.activeElement).toBe(input);
      expect(accessibleNames(await accessibleNodeDetails(), "combobox")).toEqual(["Fruit"]);

      select.searchable = false;

      expect(input.hidden).toBe(true);
      expect(input.hasAttribute("role")).toBe(false);
      expect(trigger(select).getAttribute("role")).toBe("combobox");
      expect(trigger(select).tabIndex).toBe(0);
      expect(select.shadowRoot?.activeElement).toBe(trigger(select));
      expect(display(select)).toBe("Date");
    });

    it("disables the input", async () => {
      const { select } = render(
        `<ce-select name="fruit" label="Fruit" searchable disabled>${fruits}</ce-select>`,
      );

      expect(searchInput(select).disabled).toBe(true);

      await userEvent.click(queryShadow(select, "[part='label']"));

      expect(select.shadowRoot?.activeElement).toBe(null);
    });

    it("updates only options whose visibility changed while typing", async () => {
      const { select } = render(
        `<ce-select name="item" searchable>${manyOptions(2000)}</ce-select>`,
      );

      await focusAndType(select, "option 199");

      const views = spyOnSetView();

      // "option 199" shows v199 and v1990–v1999; "option 1999" only v1999.
      await userEvent.keyboard("9");

      const touched = new Set(views.takeValues());
      const expected = new Set(["v199", "v1990", "v1991", "v1992", "v1993", "v1994"]);

      for (const value of ["v1995", "v1996", "v1997", "v1998", "v1999"]) {
        expected.add(value);
      }

      expect(touched).toEqual(expected);
      expect(shownValues(select)).toEqual(["v1999"]);

      views.restore();
    });
  });
  describe("with-clear", () => {
    function clearButton(select: CeSelect): HTMLButtonElement {
      return queryShadow<HTMLButtonElement>(select, "[part='clear-button']");
    }

    it("is hidden without with-clear or without a selection", () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);
      const { select: withClear } = render(
        `<ce-select name="other" with-clear>${fruits}</ce-select>`,
      );

      select.value = "date";

      expect(clearButton(select).hidden).toBe(true);
      expect(clearButton(withClear).hidden).toBe(true);

      withClear.value = "date";

      expect(clearButton(withClear).hidden).toBe(false);
    });

    it("clears, fires events and focuses the trigger without opening the list", async () => {
      const { form, select, events } = render(
        `<ce-select name="fruit" with-clear>${fruits}</ce-select>`,
      );

      select.value = "date";
      await userEvent.click(clearButton(select));

      expect(select.value).toBe("");
      expect(new FormData(form).has("fruit")).toBe(false);
      expect(events).toEqual(["input", "change"]);
      expect(isOpen(select)).toBe(false);
      expect(select.shadowRoot?.activeElement).toBe(trigger(select));
      expect(clearButton(select).hidden).toBe(true);
    });

    it("clears every value in multiple mode", async () => {
      const { select } = render(
        `<ce-select name="fruit" multiple with-clear>${fruits}</ce-select>`,
      );

      select.values = ["apple", "date"];
      await userEvent.click(clearButton(select));

      expect(select.values).toEqual([]);
      expect(selectedSpans(select)).toEqual([]);
    });

    it("clears typed search text even without a selection", async () => {
      const { select, events } = render(
        `<ce-select name="fruit" searchable with-clear>${fruits}</ce-select>`,
      );

      await focusAndType(select, "an");
      expect(clearButton(select).hidden).toBe(false);

      await userEvent.click(clearButton(select));

      expect(searchInput(select).value).toBe("");
      expect(shownValues(select)).toEqual(["apple", "banana", "cherry", "date"]);
      expect(events).toEqual([]);
    });

    it("is hidden while disabled", () => {
      const { select } = render(
        `<ce-select name="fruit" with-clear disabled>${fruits}</ce-select>`,
      );

      select.value = "date";

      expect(clearButton(select).hidden).toBe(true);
    });

    it("follows the with-clear attribute", () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      select.value = "date";
      select.withClear = true;
      expect(clearButton(select).hidden).toBe(false);

      select.withClear = false;
      expect(clearButton(select).hidden).toBe(true);
    });

    it("clears on Delete and Backspace while closed", async () => {
      const { select, events } = render(`<ce-select name="fruit" with-clear>${fruits}</ce-select>`);

      select.value = "date";
      await focusAndPress(select, "{Delete}");
      expect(select.value).toBe("");

      select.value = "apple";
      await userEvent.keyboard("{Backspace}");
      expect(select.value).toBe("");

      expect(events).toEqual(["input", "change", "input", "change"]);
    });

    it("removes one value per Backspace / Delete in multiple mode", async () => {
      const { select, events } = render(
        `<ce-select name="fruit" multiple with-clear>${fruits}</ce-select>`,
      );

      select.values = ["apple", "date", "banana"];
      await focusAndPress(select, "{Backspace}");
      expect(select.values).toEqual(["apple", "date"]);

      await userEvent.keyboard("{Delete}");
      expect(select.values).toEqual(["apple"]);

      expect(events).toEqual(["input", "change", "input", "change"]);
    });

    it("clears every value with Cmd or Ctrl + Backspace in multiple mode", async () => {
      const { select } = render(
        `<ce-select name="fruit" multiple with-clear>${fruits}</ce-select>`,
      );

      select.values = ["apple", "date"];
      await focusAndPress(select, "{Meta>}{Backspace}{/Meta}");
      expect(select.values).toEqual([]);

      select.values = ["apple", "date"];
      await userEvent.keyboard("{Control>}{Backspace}{/Control}");
      expect(select.values).toEqual([]);
    });

    it("doesn't clear on Delete without with-clear", async () => {
      const { select } = render(`<ce-select name="fruit">${fruits}</ce-select>`);

      select.value = "date";
      await focusAndPress(select, "{Delete}");

      expect(select.value).toBe("date");
    });

    it("searchable multiple: Backspace in the empty input removes the last value", async () => {
      const { select } = render(
        `<ce-select name="fruit" searchable multiple with-clear>${fruits}</ce-select>`,
      );

      select.values = ["apple", "date"];
      await focusAndType(select, "{Backspace}");

      expect(select.values).toEqual(["apple"]);
      expect(selectedSpans(select)).toEqual(["apple:Apple"]);
    });

    it("searchable: Backspace edits the text instead of clearing", async () => {
      const { select } = render(
        `<ce-select name="fruit" searchable multiple with-clear>${fruits}</ce-select>`,
      );

      select.values = ["date"];
      await focusAndType(select, "ap{Backspace}{Backspace}{Backspace}");

      expect(select.values).toEqual(["date"]);
      expect(searchInput(select).value).toBe("");
    });

    it("uses a slotted clear icon", () => {
      const { select } = render(`
        <ce-select name="fruit" with-clear>
          <span slot="clear-icon">×</span>
          ${fruits}
        </ce-select>
      `);
      const slot = queryShadow<HTMLSlotElement>(select, "slot[name='clear-icon']");

      expect(slot.assignedElements()).toEqual([query(select, "[slot='clear-icon']")]);
    });
  });
  describe("clearing single searchable", () => {
    it("clears when the text is erased and Tab moves on", async () => {
      const { form, select, events } = render(
        `<ce-select name="fruit" searchable>${fruits}</ce-select>`,
      );
      const other = document.createElement("input");
      form.append(other);

      select.value = "banana";
      await focusAndType(select, "{Backspace}{Tab}");

      expect(select.value).toBe("");
      expect(searchInput(select).value).toBe("");
      expect(events).toEqual(["input", "change"]);
    });

    it("clears when the text is erased and the page is pressed elsewhere", async () => {
      const { form, select } = render(`<ce-select name="fruit" searchable>${fruits}</ce-select>`);
      const outside = document.createElement("p");
      outside.textContent = "Outside";
      // Above the select, so the open list doesn't cover it.
      form.prepend(outside);

      select.value = "banana";
      await focusAndType(select, "{Backspace}");
      await userEvent.click(outside);

      expect(select.value).toBe("");
      expect(searchInput(select).value).toBe("");
    });

    it("clears with the clear button", async () => {
      const { select } = render(
        `<ce-select name="fruit" searchable with-clear>${fruits}</ce-select>`,
      );

      select.value = "banana";
      await userEvent.click(queryShadow(select, "[part='clear-button']"));

      expect(select.value).toBe("");
      expect(searchInput(select).value).toBe("");
    });

    it("clears on Backspace in the erased input with with-clear", async () => {
      const { select } = render(
        `<ce-select name="fruit" searchable with-clear>${fruits}</ce-select>`,
      );

      select.value = "banana";
      await focusAndType(select, "{Backspace}{Backspace}");

      expect(select.value).toBe("");
    });

    it("closes the list on Tab before focus moves", () => {
      const { select } = render(`<ce-select name="fruit" searchable>${fruits}</ce-select>`);
      const input = searchInput(select);

      select.value = "banana";
      input.focus();
      input.value = "";
      input.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
      expect(isOpen(select)).toBe(true);

      // The keydown alone, before any focus change: the list must already be
      // closed, or the browser searches every open option for the next
      // focusable element.
      trigger(select).dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));

      expect(isOpen(select)).toBe(false);
      expect(select.value).toBe("");
    });

    it("closes a multiple list on Tab before focus moves", async () => {
      const { select } = render(`<ce-select name="fruit" multiple>${fruits}</ce-select>`);

      await focusAndPress(select, "{ArrowDown}");
      trigger(select).dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));

      expect(isOpen(select)).toBe(false);
    });

    it("clears when the text is erased and Escape closes the list", async () => {
      const { select, events } = render(`<ce-select name="fruit" searchable>${fruits}</ce-select>`);

      select.value = "banana";
      await focusAndType(select, "{Backspace}{Escape}");

      expect(isOpen(select)).toBe(false);
      expect(select.value).toBe("");
      expect(searchInput(select).value).toBe("");
      expect(events).toEqual(["input", "change"]);
    });

    it("shows the clear button without with-clear", async () => {
      const { select } = render(`<ce-select name="fruit" searchable>${fruits}</ce-select>`);
      const button = queryShadow<HTMLButtonElement>(select, "[part='clear-button']");

      expect(button.hidden).toBe(true);

      select.value = "banana";
      expect(button.hidden).toBe(false);

      await userEvent.click(button);

      expect(select.value).toBe("");
    });

    it("clears on Backspace in the erased input without with-clear", async () => {
      const { select } = render(`<ce-select name="fruit" searchable>${fruits}</ce-select>`);

      select.value = "banana";
      await focusAndType(select, "{Backspace}{Backspace}");

      expect(select.value).toBe("");
    });
  });
});
