import { describe, expect, it } from "vite-plus/test";
import * as logic from "./logic.ts";
import type { Changes, Config, Option, State } from "./logic.ts";

/** One call of a logic function. */
type Step = (state: State) => Changes;

function option(value: string, label: string, extra: Partial<Option> = {}): Option {
  return { value, label, disabled: false, defaultSelected: false, ...extra };
}

const fruits = [
  option("apple", "Apple"),
  option("banana", "Banana"),
  option("cherry", "Cherry", { disabled: true }),
  option("date", "Date"),
];

/** Runs the steps in order (changing `state` in place), checking invariants after each. */
function run(state: State, ...steps: Step[]): State {
  for (const step of steps) {
    step(state);
    logic.checkInvariants(state);
  }

  return state;
}

/** Asserts the step reports no changes and leaves the state untouched. */
function expectNoChange(state: State, step: Step): void {
  const before = structuredClone(state);
  const changes = step(state);

  expect([...changes]).toEqual([]);
  expect(state).toEqual(before);
}

function withOptions(config: Partial<Config> = {}, options: Option[] = fruits): State {
  return run(logic.createState(config), (s) => logic.setOptions(s, options));
}

describe("setOptions", () => {
  it("keeps the first option of duplicate values", () => {
    const state = withOptions({}, [option("a", "First"), option("a", "Second")]);

    expect(state.options).toEqual([option("a", "First")]);
  });

  it("follows options marked selected while clean, last one in single mode", () => {
    const state = withOptions({}, [
      option("a", "A", { defaultSelected: true }),
      option("b", "B", { defaultSelected: true }),
    ]);

    expect(state.selection).toEqual([{ value: "b", label: "B" }]);
    expect(state.dirty).toBe(false);
  });

  it("follows all options marked selected in multiple mode", () => {
    const state = withOptions({ multiple: true }, [
      option("a", "A", { defaultSelected: true }),
      option("b", "B", { defaultSelected: true }),
    ]);

    expect(logic.formValues(state)).toEqual(["a", "b"]);
  });

  it("keeps a dirty selection and its label when the option is removed", () => {
    let state = withOptions();
    state = run(state, (s) => logic.selectOption(s, "banana"));
    state = run(state, (s) => logic.setOptions(s, [option("apple", "Apple")]));

    expect(state.selection).toEqual([{ value: "banana", label: "Banana" }]);
    expect(logic.displayText(state)).toBe("Banana");
  });

  it("fills in the label of a value set before options exist", () => {
    let state = run(logic.createState(), (s) => logic.setValues(s, ["banana"]));

    expect(state.selection).toEqual([{ value: "banana", label: null }]);
    expect(logic.displayText(state)).toBe("banana");

    state = run(state, (s) => logic.setOptions(s, fruits));

    expect(state.selection).toEqual([{ value: "banana", label: "Banana" }]);
  });

  it("refreshes the label of a selected option", () => {
    let state = run(withOptions(), (s) => logic.selectOption(s, "apple"));
    state = run(state, (s) => logic.setOptions(s, [option("apple", "Green apple")]));

    expect(logic.displayText(state)).toBe("Green apple");
  });

  it("keeps the highlight while open if it's still valid", () => {
    let state = run(
      withOptions(),
      (s) => logic.openList(s),
      (s) => logic.highlightOption(s, "banana"),
    );
    state = run(state, (s) => logic.setOptions(s, [option("banana", "Banana")]));

    expect(state.navigation.highlighted).toBe("banana");
  });

  it("moves the highlight to the first enabled option when the highlighted one goes away", () => {
    let state = run(
      withOptions(),
      (s) => logic.openList(s),
      (s) => logic.highlightOption(s, "banana"),
    );
    state = run(state, (s) =>
      logic.setOptions(s, [
        option("apple", "Apple"),
        option("banana", "Banana", { disabled: true }),
        option("date", "Date"),
      ]),
    );

    expect(state.navigation.highlighted).toBe("apple");
  });

  it("reports no changes for identical options", () => {
    expectNoChange(withOptions(), (s) => logic.setOptions(s, [...fruits]));
  });
});

describe("setValues", () => {
  it("stores values with option labels and marks the state dirty", () => {
    const state = run(withOptions({ multiple: true }), (s) => logic.setValues(s, ["date", "zzz"]));

    expect(state.selection).toEqual([
      { value: "date", label: "Date" },
      { value: "zzz", label: null },
    ]);
    expect(state.dirty).toBe(true);
  });

  it("keeps only the first value in single mode and drops duplicates", () => {
    const single = run(withOptions(), (s) => logic.setValues(s, ["apple", "date"]));
    const multiple = run(withOptions({ multiple: true }), (s) =>
      logic.setValues(s, ["apple", "apple"]),
    );

    expect(logic.formValues(single)).toEqual(["apple"]);
    expect(logic.formValues(multiple)).toEqual(["apple"]);
  });

  it("can select disabled options, like native", () => {
    const state = run(withOptions(), (s) => logic.setValues(s, ["cherry"]));

    expect(logic.formValues(state)).toEqual(["cherry"]);
  });

  it("keeps a stored label for a value whose option is gone", () => {
    let state = run(withOptions(), (s) => logic.selectOption(s, "banana"));
    state = run(
      state,
      (s) => logic.setOptions(s, []),
      (s) => logic.setValues(s, ["banana"]),
    );

    expect(state.selection).toEqual([{ value: "banana", label: "Banana" }]);
  });
});

describe("selectOption", () => {
  it("replaces the selection and closes", () => {
    const state = run(
      withOptions(),
      (s) => logic.openList(s),
      (s) => logic.selectOption(s, "banana"),
    );

    expect(logic.formValues(state)).toEqual(["banana"]);
    expect(state.open).toBe(false);
    expect(state.dirty).toBe(true);
  });

  it("ignores disabled options, missing options, multiple mode and a disabled select", () => {
    const single = withOptions();
    const multiple = withOptions({ multiple: true });
    const disabled = withOptions({ disabled: true });

    expectNoChange(single, (s) => logic.selectOption(s, "cherry"));
    expectNoChange(single, (s) => logic.selectOption(s, "zzz"));
    expectNoChange(multiple, (s) => logic.selectOption(s, "apple"));
    expectNoChange(disabled, (s) => logic.selectOption(s, "apple"));
  });
});

describe("toggleOption", () => {
  it("adds and removes values in selection order and stays open", () => {
    let state = run(withOptions({ multiple: true }), (s) => logic.openList(s));
    state = run(
      state,
      (s) => logic.toggleOption(s, "date"),
      (s) => logic.toggleOption(s, "apple"),
    );

    expect(logic.formValues(state)).toEqual(["date", "apple"]);
    expect(state.open).toBe(true);

    state = run(state, (s) => logic.toggleOption(s, "date"));

    expect(logic.formValues(state)).toEqual(["apple"]);
  });

  it("ignores single mode and disabled options", () => {
    const single = withOptions();
    const multiple = withOptions({ multiple: true });

    expectNoChange(single, (s) => logic.toggleOption(s, "apple"));
    expectNoChange(multiple, (s) => logic.toggleOption(s, "cherry"));
  });
});

describe("selectHighlighted", () => {
  it("selects in single mode and toggles in multiple mode", () => {
    const single = run(
      withOptions(),
      (s) => logic.openList(s),
      (s) => logic.selectHighlighted(s),
    );
    const multiple = run(
      withOptions({ multiple: true }),
      (s) => logic.openList(s),
      (s) => logic.selectHighlighted(s),
    );

    expect(logic.formValues(single)).toEqual(["apple"]);
    expect(single.open).toBe(false);
    expect(logic.formValues(multiple)).toEqual(["apple"]);
    expect(multiple.open).toBe(true);
  });

  it("does nothing without a highlight", () => {
    const state = withOptions();

    expectNoChange(state, (s) => logic.selectHighlighted(s));
  });
});

describe("clearSelection", () => {
  it("empties the selection", () => {
    const state = run(
      withOptions(),
      (s) => logic.selectOption(s, "apple"),
      (s) => logic.clearSelection(s),
    );

    expect(state.selection).toEqual([]);
    expect(state.dirty).toBe(true);
  });

  it("is ignored while disabled", () => {
    let state = run(withOptions(), (s) => logic.selectOption(s, "apple"));
    state = run(state, (s) => logic.setConfig(s, { disabled: true }));

    expectNoChange(state, (s) => logic.clearSelection(s));
  });
});

describe("openList and closeList", () => {
  it("highlights the selected option", () => {
    const state = run(
      withOptions(),
      (s) => logic.selectOption(s, "date"),
      (s) => logic.openList(s),
    );

    expect(state.navigation.highlighted).toBe("date");
  });

  it("highlights the first enabled option without a selection", () => {
    const state = withOptions({}, [option("a", "A", { disabled: true }), option("b", "B")]);

    expect(run(state, (s) => logic.openList(s)).navigation.highlighted).toBe("b");
  });

  it("highlights the first or last enabled option on request", () => {
    expect(run(withOptions(), (s) => logic.openList(s, "first")).navigation.highlighted).toBe(
      "apple",
    );
    expect(run(withOptions(), (s) => logic.openList(s, "last")).navigation.highlighted).toBe(
      "date",
    );
  });

  it("opens with nothing highlighted when there are no enabled options", () => {
    const state = run(logic.createState(), (s) => logic.openList(s));

    expect(state.open).toBe(true);
    expect(state.navigation.highlighted).toBe(null);
  });

  it("is ignored while disabled", () => {
    const state = withOptions({ disabled: true });

    expectNoChange(state, (s) => logic.openList(s));
  });

  it("closeList clears the highlight and query, and is a no-op when closed", () => {
    const closed = withOptions();
    const state = run(
      withOptions({ searchable: true }),
      (s) => logic.search(s, "a"),
      (s) => logic.closeList(s),
    );

    expect(state.navigation.highlighted).toBe(null);
    expect(state.query).toBe(null);
    expectNoChange(closed, (s) => logic.closeList(s));
  });
});

describe("moveHighlight and highlightOption", () => {
  it("only opens when closed, without moving the highlight", () => {
    const state = run(
      withOptions(),
      (s) => logic.selectOption(s, "banana"),
      (s) => logic.moveHighlight(s, "next"),
    );

    expect(state.open).toBe(true);
    expect(state.navigation.highlighted).toBe("banana");
  });

  it("opens at the first or last option for Home / End", () => {
    const state = run(
      withOptions(),
      (s) => logic.selectOption(s, "banana"),
      (s) => logic.moveHighlight(s, "last"),
    );

    expect(state.navigation.highlighted).toBe("date");
  });

  it("moves next / prev, skipping disabled options and wrapping", () => {
    let state = run(withOptions(), (s) => logic.openList(s));

    state = run(state, (s) => logic.moveHighlight(s, "next"));
    expect(state.navigation.highlighted).toBe("banana");

    state = run(state, (s) => logic.moveHighlight(s, "next"));
    expect(state.navigation.highlighted).toBe("date");

    state = run(state, (s) => logic.moveHighlight(s, "next"));
    expect(state.navigation.highlighted).toBe("apple");

    state = run(state, (s) => logic.moveHighlight(s, "prev"));
    expect(state.navigation.highlighted).toBe("date");
  });

  it("moves by pages and clamps", () => {
    const many: Option[] = [];

    for (let i = 0; i < 25; i++) {
      many.push(option(`v${i}`, `Value ${i}`));
    }

    let state = run(withOptions({}, many), (s) => logic.openList(s));

    state = run(state, (s) => logic.moveHighlight(s, "pageNext"));
    expect(state.navigation.highlighted).toBe("v10");

    state = run(
      state,
      (s) => logic.moveHighlight(s, "pageNext"),
      (s) => logic.moveHighlight(s, "pageNext"),
    );
    expect(state.navigation.highlighted).toBe("v24");

    state = run(state, (s) => logic.moveHighlight(s, "pagePrev"));
    expect(state.navigation.highlighted).toBe("v14");
  });

  it("highlights a value on hover only if it's enabled and visible", () => {
    const state = run(withOptions(), (s) => logic.openList(s));

    expect(run(state, (s) => logic.highlightOption(s, "date")).navigation.highlighted).toBe("date");
    expectNoChange(state, (s) => logic.highlightOption(s, "cherry"));
    expect(run(withOptions(), (s) => logic.highlightOption(s, "date")).open).toBe(false);
  });
});

describe("typeahead", () => {
  const names = [
    option("bob", "Bob"),
    option("anna", "Anna"),
    option("adam", "Adam"),
    option("alice", "Alice"),
  ];

  it("opens and highlights the first matching label", () => {
    const state = run(withOptions({}, names), (s) => logic.typeahead(s, "a"));

    expect(state.open).toBe(true);
    expect(state.navigation.highlighted).toBe("anna");
  });

  it("cycles through matches when the same key repeats", () => {
    let state = run(withOptions({}, names), (s) => logic.typeahead(s, "a"));

    state = run(state, (s) => logic.typeahead(s, "aa"));
    expect(state.navigation.highlighted).toBe("adam");

    state = run(state, (s) => logic.typeahead(s, "aaa"));
    expect(state.navigation.highlighted).toBe("alice");

    state = run(state, (s) => logic.typeahead(s, "aaaa"));
    expect(state.navigation.highlighted).toBe("anna");
  });

  it("matches longer prefixes, keeping the current option while it matches", () => {
    let state = run(withOptions({}, names), (s) => logic.typeahead(s, "a"));

    state = run(state, (s) => logic.typeahead(s, "an"));
    expect(state.navigation.highlighted).toBe("anna");

    state = run(state, (s) => logic.typeahead(s, "al"));
    expect(state.navigation.highlighted).toBe("alice");
  });

  it("searches from the top when opening without a selection", () => {
    const state = run(withOptions({}, names), (s) => logic.typeahead(s, "b"));

    expect(state.navigation.highlighted).toBe("bob");
  });

  it("searches after the selected option when opening with a selection", () => {
    let state = run(withOptions({}, names), (s) => logic.selectOption(s, "anna"));
    state = run(state, (s) => logic.typeahead(s, "a"));

    expect(state.navigation.highlighted).toBe("adam");
  });

  it("keeps the default highlight when opening finds no match", () => {
    const state = run(withOptions({}, names), (s) => logic.typeahead(s, "z"));

    expect(state.open).toBe(true);
    expect(state.navigation.highlighted).toBe("bob");
  });

  it("keeps the highlight when nothing matches, and is ignored when searchable", () => {
    const opened = run(withOptions({}, names), (s) => logic.openList(s));
    const searchable = withOptions({ searchable: true }, names);

    expect(run(opened, (s) => logic.typeahead(s, "z")).navigation.highlighted).toBe("bob");
    expectNoChange(searchable, (s) => logic.typeahead(s, "a"));
  });
});

describe("search", () => {
  it("opens, filters by label and highlights the first match", () => {
    const state = run(withOptions({ searchable: true }), (s) => logic.search(s, "AN"));

    expect(state.open).toBe(true);
    expect(logic.visibleOptions(state)).toEqual([option("banana", "Banana")]);
    expect(state.navigation.highlighted).toBe("banana");
  });

  it("shows all options when filtering is off", () => {
    const state = run(withOptions({ searchable: true, filter: false }), (s) =>
      logic.search(s, "zzz"),
    );

    expect(logic.visibleOptions(state)).toEqual(fruits);
  });

  it("highlights nothing when nothing matches", () => {
    const state = run(withOptions({ searchable: true }), (s) => logic.search(s, "zzz"));

    expect(state.navigation.highlighted).toBe(null);
  });

  it("is ignored when not searchable", () => {
    const state = withOptions();

    expectNoChange(state, (s) => logic.search(s, "a"));
  });
});

describe("dismiss", () => {
  it("clears a searchable single selection when the text was erased", () => {
    let state = run(withOptions({ searchable: true }), (s) => logic.selectOption(s, "apple"));
    state = run(
      state,
      (s) => logic.search(s, ""),
      (s) => logic.dismiss(s),
    );

    expect(state.selection).toEqual([]);
    expect(state.open).toBe(false);
  });

  it("keeps the selection when other text was typed", () => {
    let state = run(withOptions({ searchable: true }), (s) => logic.selectOption(s, "apple"));
    state = run(
      state,
      (s) => logic.search(s, "ban"),
      (s) => logic.dismiss(s),
    );

    expect(logic.formValues(state)).toEqual(["apple"]);
    expect(state.query).toBe(null);
  });

  it("keeps a searchable multiple selection when the text was erased", () => {
    const state = run(
      withOptions({ searchable: true, multiple: true }),
      (s) => logic.setValues(s, ["date", "apple"]),
      (s) => logic.search(s, ""),
      (s) => logic.dismiss(s),
    );

    expect(logic.formValues(state)).toEqual(["date", "apple"]);
    expect(state.open).toBe(false);
  });

  it("keeps a disabled selection when the text was erased", () => {
    const state = run(
      withOptions({ searchable: true }),
      (s) => logic.setValues(s, ["date"]),
      (s) => logic.search(s, ""),
      (s) => logic.setConfig(s, { disabled: true }),
      (s) => logic.dismiss(s),
    );

    expect(logic.formValues(state)).toEqual(["date"]);
  });

  it("marks the clear as a user change", () => {
    const state = run(withOptions({ searchable: true }), (s) => logic.search(s, ""));
    state.selection = [{ value: "date", label: "Date" }];
    const changes = logic.dismiss(state);

    expect(changes.has("selection")).toBe(true);
    expect(state.dirty).toBe(true);
  });

  it("only closes otherwise", () => {
    const state = run(
      withOptions(),
      (s) => logic.selectOption(s, "apple"),
      (s) => logic.openList(s),
      (s) => logic.dismiss(s),
    );

    expect(logic.formValues(state)).toEqual(["apple"]);
    expect(state.open).toBe(false);
  });
});

describe("setConfig", () => {
  it("keeps the first selected value when multiple is turned off", () => {
    let state = run(withOptions({ multiple: true }), (s) => logic.setValues(s, ["date", "apple"]));
    state = run(state, (s) => logic.setConfig(s, { multiple: false }));

    expect(logic.formValues(state)).toEqual(["date"]);
  });

  it("closes when disabled", () => {
    const state = run(
      withOptions(),
      (s) => logic.openList(s),
      (s) => logic.setConfig(s, { disabled: true }),
    );

    expect(state.open).toBe(false);
  });

  it("drops the query when searchable is turned off, keeping a still-valid highlight", () => {
    let state = run(withOptions({ searchable: true }), (s) => logic.search(s, "an"));
    state = run(state, (s) => logic.setConfig(s, { searchable: false }));

    expect(state.query).toBe(null);
    expect(logic.visibleOptions(state)).toEqual(fruits);
    expect(state.navigation.highlighted).toBe("banana");
  });
});

describe("reset", () => {
  it("goes back to options marked selected and becomes clean", () => {
    let state = withOptions({}, [option("a", "A"), option("b", "B", { defaultSelected: true })]);
    state = run(
      state,
      (s) => logic.selectOption(s, "a"),
      (s) => logic.reset(s),
    );

    expect(logic.formValues(state)).toEqual(["b"]);
    expect(state.dirty).toBe(false);
  });

  it("is empty without options marked selected", () => {
    const state = run(
      withOptions(),
      (s) => logic.selectOption(s, "apple"),
      (s) => logic.reset(s),
    );

    expect(state.selection).toEqual([]);
  });
});

describe("changes", () => {
  it("changes the state in place and reports the changed fields", () => {
    const state = run(withOptions(), (s) => logic.openList(s));
    const changes = logic.selectOption(state, "banana");

    expect(state.selection).toEqual([{ value: "banana", label: "Banana" }]);
    expect([...changes].sort()).toEqual(["dirty", "navigation", "open", "selection"]);
  });
});

describe("reading the state", () => {
  it("displayText joins labels, falling back to the value", () => {
    const state = run(withOptions({ multiple: true }), (s) =>
      logic.setValues(s, ["date", "mango"]),
    );

    expect(logic.displayText(state)).toBe("Date, mango");
  });

  it("formValue: the value in single mode", () => {
    const state = run(withOptions(), (s) => logic.setValues(s, ["date"]));

    expect(logic.formValue(state, "fruit")).toBe("date");
  });

  it("formValue: FormData entries under the name in multiple mode", () => {
    const state = run(withOptions({ multiple: true }), (s) =>
      logic.setValues(s, ["date", "apple"]),
    );
    const value = logic.formValue(state, "fruit");

    if (!(value instanceof FormData)) {
      throw new Error("Expected FormData");
    }

    expect(value.getAll("fruit")).toEqual(["date", "apple"]);
  });

  it("formValue: nothing when empty, or multiple without a name", () => {
    const empty = withOptions();
    const unnamed = run(withOptions({ multiple: true }), (s) => logic.setValues(s, ["date"]));

    expect(logic.formValue(empty, "fruit")).toBe(null);
    expect(logic.formValue(unnamed, "")).toBe(null);
  });

  it("hasSelection and isSelected", () => {
    const state = run(withOptions(), (s) => logic.setValues(s, ["date"]));

    expect(logic.hasSelection(state)).toBe(true);
    expect(logic.isSelected(state, "date")).toBe(true);
    expect(logic.isSelected(state, "apple")).toBe(false);
    expect(logic.hasSelection(withOptions())).toBe(false);
  });
});

describe("keys", () => {
  function key(name: string, modifiers: Partial<logic.KeyInput> = {}): logic.KeyInput {
    return { key: name, altKey: false, ctrlKey: false, metaKey: false, ...modifiers };
  }

  it("shouldSubmitOnEnter: Enter on a closed searchable select only", () => {
    const searchable = withOptions({ searchable: true });
    const plain = withOptions();
    const open = run(withOptions({ searchable: true }), (s) => logic.openList(s));

    expect(logic.shouldSubmitOnEnter(searchable, key("Enter"))).toBe(true);
    expect(logic.shouldSubmitOnEnter(searchable, key("ArrowDown"))).toBe(false);
    expect(logic.shouldSubmitOnEnter(plain, key("Enter"))).toBe(false);
    expect(logic.shouldSubmitOnEnter(open, key("Enter"))).toBe(false);
  });

  it("isPrintable: single characters without Ctrl, Meta or Alt", () => {
    expect(logic.isPrintable(key("a"))).toBe(true);
    expect(logic.isPrintable(key(" "))).toBe(true);
    expect(logic.isPrintable(key("Enter"))).toBe(false);
    expect(logic.isPrintable(key("a", { ctrlKey: true }))).toBe(false);
    expect(logic.isPrintable(key("a", { metaKey: true }))).toBe(false);
    expect(logic.isPrintable(key("a", { altKey: true }))).toBe(false);
  });
});

describe("with-clear", () => {
  function key(name: string, modifiers: Partial<logic.KeyInput> = {}): logic.KeyInput {
    return { key: name, altKey: false, ctrlKey: false, metaKey: false, ...modifiers };
  }

  it("clearSelection leaves the list open or closed as it was", () => {
    const open = run(
      withOptions(),
      (s) => logic.setValues(s, ["date"]),
      (s) => logic.openList(s),
    );
    const closed = run(withOptions(), (s) => logic.setValues(s, ["date"]));

    run(open, (s) => logic.clearSelection(s));
    run(closed, (s) => logic.clearSelection(s));

    expect(open.open).toBe(true);
    expect(open.selection).toEqual([]);
    expect(closed.open).toBe(false);
  });

  it("shouldShowClear: with a selection or search text, enabled, and with-clear set", () => {
    const empty = withOptions({ searchable: true });
    const selected = run(withOptions(), (s) => logic.setValues(s, ["date"]));
    const searching = run(withOptions({ searchable: true }), (s) => logic.search(s, "an"));
    const erased = run(withOptions({ searchable: true }), (s) => logic.search(s, ""));
    const disabled = run(
      withOptions(),
      (s) => logic.setValues(s, ["date"]),
      (s) => logic.setConfig(s, { disabled: true }),
    );

    expect(logic.shouldShowClear(empty, true)).toBe(false);
    expect(logic.shouldShowClear(selected, true)).toBe(true);
    expect(logic.shouldShowClear(selected, false)).toBe(false);
    expect(logic.shouldShowClear(searching, true)).toBe(true);
    expect(logic.shouldShowClear(erased, true)).toBe(false);
    expect(logic.shouldShowClear(disabled, true)).toBe(false);
  });

  it("removeLastSelected removes the most recently selected value", () => {
    const state = run(
      withOptions({ multiple: true }),
      (s) => logic.setValues(s, ["date", "apple"]),
      (s) => logic.removeLastSelected(s),
    );

    expect(logic.formValues(state)).toEqual(["date"]);
    expect(state.dirty).toBe(true);
  });

  it("removeLastSelected does nothing when empty or disabled", () => {
    const disabled = run(
      withOptions({ multiple: true }),
      (s) => logic.setValues(s, ["date"]),
      (s) => logic.setConfig(s, { disabled: true }),
    );

    expectNoChange(withOptions({ multiple: true }), (s) => logic.removeLastSelected(s));
    expectNoChange(disabled, (s) => logic.removeLastSelected(s));
  });

  it("clearForKey: multiple removes the last value, Cmd / Ctrl clear everything", () => {
    const state = run(withOptions({ multiple: true }), (s) =>
      logic.setValues(s, ["date", "apple"]),
    );

    expect(logic.clearForKey(state, key("Backspace"), true, "")).toBe("last");
    expect(logic.clearForKey(state, key("Delete"), true, "")).toBe("last");
    expect(logic.clearForKey(state, key("Backspace", { metaKey: true }), true, "")).toBe("all");
    expect(logic.clearForKey(state, key("Backspace", { ctrlKey: true }), true, "")).toBe("all");
    expect(logic.clearForKey(state, key("Backspace", { altKey: true }), true, "")).toBe(null);
  });

  it("clearForKey: single clears its value", () => {
    const state = run(withOptions(), (s) => logic.setValues(s, ["date"]));

    expect(logic.clearForKey(state, key("Backspace"), true, "")).toBe("all");
    expect(logic.clearForKey(state, key("Delete"), true, "")).toBe("all");
  });

  it("clearForKey: nothing for other keys, without with-clear, while open, empty or disabled", () => {
    const state = run(withOptions(), (s) => logic.setValues(s, ["date"]));
    const open = run(
      withOptions(),
      (s) => logic.setValues(s, ["date"]),
      (s) => logic.openList(s),
    );
    const disabled = run(
      withOptions(),
      (s) => logic.setValues(s, ["date"]),
      (s) => logic.setConfig(s, { disabled: true }),
    );

    expect(logic.clearForKey(state, key("Enter"), true, "")).toBe(null);
    expect(logic.clearForKey(state, key("Delete"), false, "")).toBe(null);
    expect(logic.clearForKey(open, key("Delete"), true, "")).toBe(null);
    expect(logic.clearForKey(withOptions(), key("Delete"), true, "")).toBe(null);
    expect(logic.clearForKey(disabled, key("Delete"), true, "")).toBe(null);
  });

  it("clearForKey: searchable only while the input is empty and not searching", () => {
    const multiple = run(withOptions({ searchable: true, multiple: true }), (s) =>
      logic.setValues(s, ["date"]),
    );
    const searching = run(
      withOptions({ searchable: true, multiple: true }),
      (s) => logic.setValues(s, ["date"]),
      (s) => logic.search(s, ""),
    );

    // Empty input, not searching: open or closed.
    expect(logic.clearForKey(multiple, key("Backspace"), true, "")).toBe("last");
    // The input shows text (e.g. the single label): the key edits it.
    expect(logic.clearForKey(multiple, key("Backspace"), true, "Date")).toBe(null);
    // Erased a search: Backspace keeps editing, it doesn't remove values.
    expect(logic.clearForKey(searching, key("Backspace"), true, "")).toBe(null);
  });
});

describe("clearing single searchable", () => {
  function key(name: string): logic.KeyInput {
    return { key: name, altKey: false, ctrlKey: false, metaKey: false };
  }

  it("shouldSelectOnTab: single picks the highlight, except with erased search text", () => {
    const plain = run(withOptions(), (s) => logic.openList(s));
    const typed = run(withOptions({ searchable: true }), (s) => logic.search(s, "an"));
    const erased = run(withOptions({ searchable: true }), (s) => logic.search(s, ""));
    const multiple = run(withOptions({ multiple: true }), (s) => logic.openList(s));

    expect(logic.shouldSelectOnTab(plain)).toBe(true);
    expect(logic.shouldSelectOnTab(typed)).toBe(true);
    expect(logic.shouldSelectOnTab(erased)).toBe(false);
    expect(logic.shouldSelectOnTab(multiple)).toBe(false);
  });

  it("clearForKey: Backspace in the erased input clears the single value, even without with-clear", () => {
    const state = run(
      withOptions({ searchable: true }),
      (s) => logic.setValues(s, ["date"]),
      (s) => logic.search(s, ""),
    );

    expect(logic.clearForKey(state, key("Backspace"), true, "")).toBe("all");
    expect(logic.clearForKey(state, key("Backspace"), false, "")).toBe("all");
  });

  it("isClearable: with-clear, or always in searchable single mode", () => {
    expect(logic.isClearable(withOptions(), false)).toBe(false);
    expect(logic.isClearable(withOptions(), true)).toBe(true);
    expect(logic.isClearable(withOptions({ searchable: true }), false)).toBe(true);
    expect(logic.isClearable(withOptions({ searchable: true, multiple: true }), false)).toBe(false);
    expect(logic.isClearable(withOptions({ searchable: true, multiple: true }), true)).toBe(true);
  });

  it("shouldShowClear: searchable single shows without with-clear", () => {
    const selected = run(withOptions({ searchable: true }), (s) => logic.setValues(s, ["date"]));
    const multiple = run(withOptions({ searchable: true, multiple: true }), (s) =>
      logic.setValues(s, ["date"]),
    );

    expect(logic.shouldShowClear(selected, false)).toBe(true);
    expect(logic.shouldShowClear(multiple, false)).toBe(false);
  });
});

describe("random call sequences", () => {
  /** Small seeded PRNG (mulberry32), so failures are reproducible. */
  function createRandom(seed: number): () => number {
    let a = seed;

    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** A step with a description, so a failing sequence says what it did. */
  type RandomStep = {
    description: string;
    /** Caused by the user: changes nothing while disabled. */
    isUser: boolean;
    /** Replaces the options: must keep a dirty selection. */
    isSetOptions: boolean;
    run: Step;
  };

  const values = ["a", "b", "c", "d", "e"];

  function randomStep(random: () => number): RandomStep {
    function pick<T>(items: readonly T[]): T {
      return items[Math.floor(random() * items.length)] as T;
    }

    function step(description: string, isUser: boolean, run: Step): RandomStep {
      return { description, isUser, isSetOptions: false, run };
    }

    const kind = pick([
      "setOptions",
      "setValues",
      "selectOption",
      "toggleOption",
      "selectHighlighted",
      "clearSelection",
      "removeLastSelected",
      "openList",
      "closeList",
      "moveHighlight",
      "highlightOption",
      "typeahead",
      "search",
      "dismiss",
      "setConfig",
      "reset",
    ] as const);

    switch (kind) {
      case "setOptions": {
        const options: Option[] = [];
        const count = Math.floor(random() * 6);

        for (let i = 0; i < count; i++) {
          const value = pick(values);
          options.push(
            option(value, pick(["Apple", "Avocado", "Banana", value]), {
              disabled: random() < 0.3,
              defaultSelected: random() < 0.3,
            }),
          );
        }

        return {
          description: `setOptions(${JSON.stringify(options)})`,
          isUser: false,
          isSetOptions: true,
          run: (s) => logic.setOptions(s, options),
        };
      }
      case "setValues": {
        const chosen: string[] = [];
        const count = Math.floor(random() * 3);

        for (let i = 0; i < count; i++) {
          chosen.push(pick(values));
        }

        return step(`setValues(${JSON.stringify(chosen)})`, false, (s) =>
          logic.setValues(s, chosen),
        );
      }
      case "selectOption": {
        const value = pick(values);
        return step(`selectOption("${value}")`, true, (s) => logic.selectOption(s, value));
      }
      case "toggleOption": {
        const value = pick(values);
        return step(`toggleOption("${value}")`, true, (s) => logic.toggleOption(s, value));
      }
      case "selectHighlighted":
        return step("selectHighlighted()", true, (s) => logic.selectHighlighted(s));
      case "clearSelection":
        return step("clearSelection()", true, (s) => logic.clearSelection(s));
      case "removeLastSelected":
        return step("removeLastSelected()", true, (s) => logic.removeLastSelected(s));
      case "openList": {
        const at = pick([undefined, "first", "last"] as const);
        return step(`openList(${at ?? ""})`, true, (s) => logic.openList(s, at));
      }
      case "closeList":
        return step("closeList()", false, (s) => logic.closeList(s));
      case "moveHighlight": {
        const to = pick(["next", "prev", "first", "last", "pageNext", "pagePrev"] as const);
        return step(`moveHighlight("${to}")`, true, (s) => logic.moveHighlight(s, to));
      }
      case "highlightOption": {
        const value = pick(values);
        return step(`highlightOption("${value}")`, true, (s) => logic.highlightOption(s, value));
      }
      case "typeahead": {
        const text = pick(["a", "aa", "b", "av", "z"]);
        return step(`typeahead("${text}")`, true, (s) => logic.typeahead(s, text));
      }
      case "search": {
        const text = pick(["", "a", "an", "zzz"]);
        return step(`search("${text}")`, true, (s) => logic.search(s, text));
      }
      case "dismiss":
        return step("dismiss()", false, (s) => logic.dismiss(s));
      case "setConfig": {
        const name = pick(["multiple", "searchable", "filter", "disabled"] as const);
        const config: Partial<Config> = { [name]: random() < 0.5 };
        return step(`setConfig(${JSON.stringify(config)})`, false, (s) =>
          logic.setConfig(s, config),
        );
      }
      case "reset":
        return step("reset()", false, (s) => logic.reset(s));
    }
  }

  for (const seed of [1, 2, 3, 4, 5]) {
    it(`keeps every invariant (seed ${seed})`, () => {
      const random = createRandom(seed);
      const state = logic.createState();

      for (let index = 0; index < 2000; index++) {
        const step = randomStep(random);
        const before = structuredClone(state);
        const changes = step.run(state);
        const context = `seed ${seed}, step ${index}, ${step.description}`;

        try {
          logic.checkInvariants(state);
        } catch (error) {
          throw new Error(`${(error as Error).message} (${context})`, { cause: error });
        }

        // Exactly the fields that differ are reported.
        for (const field of Object.keys(state) as (keyof State)[]) {
          const differs = JSON.stringify(before[field]) !== JSON.stringify(state[field]);
          expect(changes.has(field), `${field}: ${context}`).toBe(differs);
        }

        if (before.config.disabled && step.isUser) {
          expect([...changes], context).toEqual([]);
        }

        if (step.isSetOptions && before.dirty) {
          expect(logic.formValues(state), context).toEqual(logic.formValues(before));
        }
      }
    });
  }
});
