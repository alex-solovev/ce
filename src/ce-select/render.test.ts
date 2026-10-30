import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { CeOption } from "./ce-option.ts";
import type { CeSelect } from "./ce-select.ts";
import * as logic from "./logic.ts";
import type { Config } from "./logic.ts";
import * as render from "./render.ts";
import type { SelectContext } from "./render.ts";

/**
 * Stands in for ce-select: form-associated, with real internals, but none
 * of its behaviour, so render functions can be called directly.
 */
class TestHost extends HTMLElement {
  static formAssociated = true;

  internals: ElementInternals = this.attachInternals();

  placeholder = "";

  get name(): string {
    return this.getAttribute("name") ?? "";
  }
}

customElements.define("render-test-host", TestHost);

type Setup = {
  form: HTMLFormElement;
  host: TestHost;
  context: SelectContext;
};

const fruits = `
  <ce-option value="apple">Apple</ce-option>
  <ce-option value="banana">Banana</ce-option>
  <ce-option value="cherry" disabled>Cherry</ce-option>
  <ce-option value="date">Date</ce-option>
`;

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

/** A connected host with options, its context, and every option rendered once. */
function setup(html = fruits, config: Partial<Config> = {}): Setup {
  const form = document.createElement("form");
  const host = new TestHost();
  host.setAttribute("name", "fruit");
  host.innerHTML = html;
  form.append(host);
  document.body.append(form);

  const state = logic.createState(config);
  const context = render.createContext(host as unknown as CeSelect, host.internals, state);

  logic.setOptions(state, render.collectOptions(context));
  render.allOptions(context);

  return { form, host, context };
}

function element(host: TestHost, value: string): CeOption {
  const option = host.querySelector(`ce-option[value='${value}']`);

  if (!(option instanceof CeOption)) {
    throw new Error(`No option ${value}`);
  }

  return option;
}

function spans(context: SelectContext): string[] {
  const result: string[] = [];

  for (const span of context.refs.display.querySelectorAll<HTMLElement>(
    "[part='selected-option']",
  )) {
    result.push(`${span.dataset.value}:${span.textContent}`);
  }

  return result;
}

/** Records which options `setView` is called on. */
function spyOnViews() {
  const spy = vi.spyOn(CeOption.prototype, "setView");

  return {
    values(): string[] {
      const result: string[] = [];

      for (const context of spy.mock.contexts) {
        result.push((context as CeOption).value);
      }

      return result;
    },
    restore(): void {
      spy.mockRestore();
    },
  };
}

describe("collectRefs", () => {
  it("throws when a part is missing", () => {
    const root = document.createElement("div").attachShadow({ mode: "open" });

    expect(() => render.collectRefs(root)).toThrow(/part='base'/);
  });
});

describe("collectOptions", () => {
  it("reads the option data and maps each value to its first element", () => {
    const { host, context } = setup(`
      <ce-option value="a" selected>First A</ce-option>
      <ce-option value="a">Second A</ce-option>
      <ce-option value="b" disabled>B</ce-option>
    `);

    const options = render.collectOptions(context);

    expect(options).toEqual([
      { value: "a", label: "First A", disabled: false, defaultSelected: true },
      { value: "a", label: "Second A", disabled: false, defaultSelected: false },
      { value: "b", label: "B", disabled: true, defaultSelected: false },
    ]);
    expect(context.elements.get("a")).toBe(host.querySelector("ce-option"));
    expect(context.elements.size).toBe(2);
  });
});

describe("selection", () => {
  it("shows the placeholder and submits nothing without a selection", () => {
    const { form, host, context } = setup();
    host.placeholder = "Pick one";

    render.selection(context);

    expect(context.refs.display.textContent).toBe("Pick one");
    expect(context.refs.display.title).toBe("");
    expect(host.matches(":state(blank)")).toBe(true);
    expect(new FormData(form).has("fruit")).toBe(false);
  });

  it("shows one span per selected label, with the title and form value", () => {
    const { form, host, context } = setup(fruits, { multiple: true });

    logic.setValues(context.state, ["date", "mango"]);
    render.selection(context);

    expect(spans(context)).toEqual(["date:Date", "mango:mango"]);
    expect(context.refs.display.title).toBe("Date, mango");
    expect(host.matches(":state(blank)")).toBe(false);
    expect(new FormData(form).getAll("fruit")).toEqual(["date", "mango"]);
  });

  it("hides the display in searchable single mode, where the input shows the label", () => {
    const { context } = setup(fruits, { searchable: true });

    logic.setValues(context.state, ["date"]);
    render.selection(context);

    expect(context.refs.display.hidden).toBe(true);
  });

  it("leaves the placeholder to the input when searchable", () => {
    const { host, context } = setup(fruits, { searchable: true, multiple: true });
    host.placeholder = "Pick one";

    render.selection(context);

    expect(context.refs.display.textContent).toBe("");
  });
});

describe("input", () => {
  it("does nothing when not searchable", () => {
    const { context } = setup();

    logic.setValues(context.state, ["date"]);
    render.input(context);

    expect(context.refs.input.value).toBe("");
  });

  it("shows the selected label in single mode, and the typed text while searching", () => {
    const { context } = setup(fruits, { searchable: true });

    logic.setValues(context.state, ["date"]);
    render.input(context);
    expect(context.refs.input.value).toBe("Date");

    logic.search(context.state, "ba");
    render.input(context);
    expect(context.refs.input.value).toBe("ba");
  });

  it("stays empty in multiple mode while not searching", () => {
    const { context } = setup(fruits, { searchable: true, multiple: true });

    logic.setValues(context.state, ["date", "apple"]);
    render.input(context);

    expect(context.refs.input.value).toBe("");
  });

  it("shows the placeholder only while nothing is selected", () => {
    const { host, context } = setup(fruits, { searchable: true });
    host.placeholder = "Pick one";

    render.input(context);
    expect(context.refs.input.placeholder).toBe("Pick one");

    logic.setValues(context.state, ["date"]);
    render.input(context);
    expect(context.refs.input.placeholder).toBe("");
  });
});

describe("open", () => {
  it("shows the popup and marks the trigger expanded, then reverses it", () => {
    const { host, context } = setup();

    logic.openList(context.state);
    render.open(context);

    expect(context.refs.listbox.matches(":popover-open")).toBe(true);
    expect(context.refs.box.ariaExpanded).toBe("true");
    expect(host.matches(":state(open)")).toBe(true);

    logic.closeList(context.state);
    render.open(context);

    expect(context.refs.listbox.matches(":popover-open")).toBe(false);
    expect(context.refs.box.ariaExpanded).toBe("false");
    expect(host.matches(":state(open)")).toBe(false);
  });
});

describe("allOptions", () => {
  it("gives every option its view and records what's shown", () => {
    const { host, context } = setup(fruits, { multiple: true });

    logic.setValues(context.state, ["date"]);
    logic.openList(context.state);
    render.allOptions(context);

    expect(element(host, "date").matches(":state(selected)")).toBe(true);
    expect(element(host, "date").matches(":state(highlighted)")).toBe(true);
    expect(element(host, "apple").matches(":state(checkable)")).toBe(true);
    expect(context.rendered.highlight).toBe("date");
    expect(context.rendered.selection).toEqual(new Set(["date"]));
    expect(context.rendered.multiple).toBe(true);
  });

  it("gives duplicate values a plain view", () => {
    const { host, context } = setup(`
      <ce-option value="a">First A</ce-option>
      <ce-option value="a">Second A</ce-option>
    `);
    const [, second] = host.querySelectorAll("ce-option");

    logic.setValues(context.state, ["a"]);
    render.allOptions(context);

    expect(second?.matches(":state(selected)")).toBe(false);
  });
});

describe("highlightChange", () => {
  it("updates only the old and new highlighted option and the active descendant", () => {
    const { host, context } = setup();

    logic.openList(context.state);
    render.highlightChange(context);

    const views = spyOnViews();

    logic.moveHighlight(context.state, "next");
    render.highlightChange(context);

    expect(views.values()).toEqual(["apple", "banana"]);
    expect(element(host, "banana").matches(":state(highlighted)")).toBe(true);
    expect(context.refs.box.ariaActiveDescendantElement).toBe(element(host, "banana"));

    views.restore();
  });
});

describe("selectionChange", () => {
  it("updates only options that were selected or deselected", () => {
    const { host, context } = setup(fruits, { multiple: true });

    logic.setValues(context.state, ["apple", "banana"]);
    render.selectionChange(context);

    const views = spyOnViews();

    logic.setValues(context.state, ["banana", "date"]);
    render.selectionChange(context);

    expect(new Set(views.values())).toEqual(new Set(["apple", "date"]));
    expect(element(host, "apple").matches(":state(selected)")).toBe(false);
    expect(element(host, "date").matches(":state(selected)")).toBe(true);

    views.restore();
  });
});

describe("filter", () => {
  it("hides options that don't match and shows them again", () => {
    const { host, context } = setup(fruits, { searchable: true });

    logic.search(context.state, "an");
    render.filter(context, true);

    expect(element(host, "apple").matches(":state(filtered-out)")).toBe(true);
    expect(element(host, "banana").matches(":state(filtered-out)")).toBe(false);
    expect(context.rendered.hidden).toEqual(new Set(["apple", "cherry", "date"]));

    logic.search(context.state, "");
    render.filter(context, true);

    expect(element(host, "apple").matches(":state(filtered-out)")).toBe(false);
    expect(context.rendered.hidden).toEqual(new Set());
  });

  it("updates only options whose visibility changed", () => {
    const { context } = setup(fruits, { searchable: true });

    logic.search(context.state, "a");
    render.filter(context, true);

    const views = spyOnViews();

    // "a" hides nothing but cherry; "an" also hides apple and date.
    logic.search(context.state, "an");
    render.filter(context, true);

    expect(new Set(views.values())).toEqual(new Set(["apple", "date"]));

    views.restore();
  });

  it("leaves the options alone when asked to", () => {
    const { context } = setup(fruits, { searchable: true });
    const views = spyOnViews();

    logic.search(context.state, "an");
    render.filter(context, false);

    expect(views.values()).toEqual([]);
    expect(context.rendered.hidden).toEqual(new Set(["apple", "cherry", "date"]));

    views.restore();
  });

  it("shows the no-results row only while a search matches nothing", () => {
    const { context } = setup(fruits, { searchable: true });

    logic.search(context.state, "zz");
    render.filter(context, true);
    expect(context.refs.noResults.hidden).toBe(false);

    logic.search(context.state, "");
    render.filter(context, true);
    expect(context.refs.noResults.hidden).toBe(true);
  });

  it("announces the result count once typing pauses", () => {
    const { context } = setup(fruits, { searchable: true });

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    logic.search(context.state, "a");
    render.filter(context, true);
    vi.advanceTimersByTime(200);

    logic.search(context.state, "an");
    render.filter(context, true);
    vi.advanceTimersByTime(299);

    // The first count was dropped when typing continued.
    expect(context.refs.liveRegion.textContent).toBe("");

    vi.advanceTimersByTime(1);
    expect(context.refs.liveRegion.textContent).toBe("1 result");

    logic.search(context.state, "zz");
    render.filter(context, true);
    vi.advanceTimersByTime(300);
    expect(context.refs.liveRegion.textContent).toBe("No results");

    // Disabled options still count: they're shown, just not selectable.
    logic.search(context.state, "e");
    render.filter(context, true);
    vi.advanceTimersByTime(300);
    expect(context.refs.liveRegion.textContent).toBe("3 results");
  });
});

describe("activeDescendant", () => {
  it("points the trigger at the highlighted option and clears it without one", () => {
    const { host, context } = setup();

    logic.openList(context.state, "last");
    render.activeDescendant(context);
    expect(context.refs.box.ariaActiveDescendantElement).toBe(element(host, "date"));

    logic.closeList(context.state);
    render.activeDescendant(context);
    expect(context.refs.box.ariaActiveDescendantElement).toBe(null);
  });

  it("scrolls the list on the next animation frame, not right away", async () => {
    let html = "";

    for (let i = 0; i < 50; i++) {
      html += `<ce-option value="v${i}">Option ${i}</ce-option>`;
    }

    const { context } = setup(html);

    logic.openList(context.state);
    render.open(context);

    const measure = vi.spyOn(context.refs.listbox, "getBoundingClientRect");

    logic.moveHighlight(context.state, "last");
    render.activeDescendant(context);

    expect(measure).not.toHaveBeenCalled();

    await new Promise((resolve) => {
      requestAnimationFrame(resolve);
    });

    expect(measure).toHaveBeenCalledTimes(1);
    expect(context.refs.listbox.scrollTop).toBeGreaterThan(0);

    measure.mockRestore();
  });
});

describe("disabled", () => {
  it("removes the box from the tab order and disables the input", () => {
    const { context } = setup();

    logic.setConfig(context.state, { disabled: true });
    render.disabled(context);

    expect(context.refs.box.hasAttribute("tabindex")).toBe(false);
    expect(context.refs.box.ariaDisabled).toBe("true");
    expect(context.refs.input.disabled).toBe(true);

    logic.setConfig(context.state, { disabled: false });
    render.disabled(context);

    expect(context.refs.box.tabIndex).toBe(0);
    expect(context.refs.box.ariaDisabled).toBe(null);
    expect(context.refs.input.disabled).toBe(false);
  });

  it("keeps the box out of the tab order when searchable", () => {
    const { context } = setup(fruits, { searchable: true });

    render.disabled(context);

    expect(context.refs.box.hasAttribute("tabindex")).toBe(false);
  });
});

describe("multiple", () => {
  it("marks the listbox multiselectable", () => {
    const { context } = setup(fruits, { multiple: true });

    render.multiple(context);
    expect(context.refs.listbox.ariaMultiSelectable).toBe("true");

    logic.setConfig(context.state, { multiple: false });
    render.multiple(context);
    expect(context.refs.listbox.ariaMultiSelectable).toBe(null);
  });
});

describe("triggerRole", () => {
  it("moves the combobox role between the box and the input", () => {
    const { host, context } = setup();
    const { box, input } = context.refs;

    render.triggerRole(context);

    expect(box.getAttribute("role")).toBe("combobox");
    expect(box.getAttribute("aria-controls")).toBe("listbox");
    expect(input.hidden).toBe(true);
    expect(render.trigger(context)).toBe(box);

    logic.setConfig(context.state, { searchable: true });
    render.triggerRole(context);

    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.ariaAutoComplete).toBe("list");
    expect(input.hidden).toBe(false);
    expect(box.hasAttribute("role")).toBe(false);
    expect(box.hasAttribute("aria-controls")).toBe(false);
    expect(host.matches(":state(searchable)")).toBe(true);
    expect(render.trigger(context)).toBe(input);
  });
});

describe("label", () => {
  it("names the trigger and the listbox by the label", () => {
    const { host, context } = setup();
    host.setAttribute("label", "Fruit");

    render.label(context);

    const label = context.root.querySelector("[part='label']");

    expect(context.refs.box.ariaLabelledByElements).toEqual([label]);
    expect(context.refs.listbox.ariaLabelledByElements).toEqual([label]);
  });
});
