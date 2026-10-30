import { describe, expect, it } from "vite-plus/test";
import {
  checkInvariants,
  createState,
  displayText,
  formValues,
  reduce,
  visibleOptions,
} from "./select-state.ts";
import type { Action, Config, Option, State } from "./select-state.ts";

function option(value: string, label: string, extra: Partial<Option> = {}): Option {
  return { value, label, disabled: false, defaultSelected: false, ...extra };
}

const fruits = [
  option("apple", "Apple"),
  option("banana", "Banana"),
  option("cherry", "Cherry", { disabled: true }),
  option("date", "Date"),
];

/** Applies actions in order (in place), checking invariants after each. */
function run(state: State, ...actions: Action[]): State {
  for (const action of actions) {
    reduce(state, action);
    checkInvariants(state);
  }

  return state;
}

/** Asserts the action reports no changes and leaves the state untouched. */
function expectNoChange(state: State, action: Action): void {
  const before = structuredClone(state);
  const changes = reduce(state, action);

  expect([...changes]).toEqual([]);
  expect(state).toEqual(before);
}

function withOptions(config: Partial<Config> = {}, options: Option[] = fruits): State {
  return run(createState(config), { type: "OPTIONS_CHANGED", options });
}

describe("OPTIONS_CHANGED", () => {
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

    expect(formValues(state)).toEqual(["a", "b"]);
  });

  it("keeps a dirty selection and its label when the option is removed", () => {
    let state = withOptions();
    state = run(state, { type: "SELECT", value: "banana" });
    state = run(state, { type: "OPTIONS_CHANGED", options: [option("apple", "Apple")] });

    expect(state.selection).toEqual([{ value: "banana", label: "Banana" }]);
    expect(displayText(state)).toBe("Banana");
  });

  it("fills in the label of a value set before options exist", () => {
    let state = run(createState(), { type: "SET_VALUE", values: ["banana"] });

    expect(state.selection).toEqual([{ value: "banana", label: null }]);
    expect(displayText(state)).toBe("banana");

    state = run(state, { type: "OPTIONS_CHANGED", options: fruits });

    expect(state.selection).toEqual([{ value: "banana", label: "Banana" }]);
  });

  it("refreshes the label of a selected option", () => {
    let state = run(withOptions(), { type: "SELECT", value: "apple" });
    state = run(state, { type: "OPTIONS_CHANGED", options: [option("apple", "Green apple")] });

    expect(displayText(state)).toBe("Green apple");
  });

  it("keeps the highlight while open if it's still valid", () => {
    let state = run(withOptions(), { type: "OPEN" }, { type: "HIGHLIGHT", value: "banana" });
    state = run(state, { type: "OPTIONS_CHANGED", options: [option("banana", "Banana")] });

    expect(state.highlighted).toBe("banana");
  });

  it("moves the highlight to the next option when the highlighted one goes away", () => {
    let state = run(withOptions(), { type: "OPEN" }, { type: "HIGHLIGHT", value: "banana" });
    state = run(state, {
      type: "OPTIONS_CHANGED",
      options: [
        option("apple", "Apple"),
        option("banana", "Banana", { disabled: true }),
        option("date", "Date"),
      ],
    });

    expect(state.highlighted).toBe("date");
  });

  it("reports no changes for identical options", () => {
    expectNoChange(withOptions(), { type: "OPTIONS_CHANGED", options: [...fruits] });
  });
});

describe("SET_VALUE and RESTORE", () => {
  it("stores values with option labels and marks the state dirty", () => {
    const state = run(withOptions({ multiple: true }), {
      type: "SET_VALUE",
      values: ["date", "zzz"],
    });

    expect(state.selection).toEqual([
      { value: "date", label: "Date" },
      { value: "zzz", label: null },
    ]);
    expect(state.dirty).toBe(true);
  });

  it("keeps only the first value in single mode and drops duplicates", () => {
    const single = run(withOptions(), { type: "SET_VALUE", values: ["apple", "date"] });
    const multiple = run(withOptions({ multiple: true }), {
      type: "SET_VALUE",
      values: ["apple", "apple"],
    });

    expect(formValues(single)).toEqual(["apple"]);
    expect(formValues(multiple)).toEqual(["apple"]);
  });

  it("can select disabled options, like native", () => {
    const state = run(withOptions(), { type: "SET_VALUE", values: ["cherry"] });

    expect(formValues(state)).toEqual(["cherry"]);
  });

  it("keeps a stored label for a value whose option is gone", () => {
    let state = run(withOptions(), { type: "SELECT", value: "banana" });
    state = run(
      state,
      { type: "OPTIONS_CHANGED", options: [] },
      { type: "SET_VALUE", values: ["banana"] },
    );

    expect(state.selection).toEqual([{ value: "banana", label: "Banana" }]);
  });

  it("RESTORE behaves like SET_VALUE", () => {
    const state = run(withOptions(), { type: "RESTORE", values: ["date"] });

    expect(state.selection).toEqual([{ value: "date", label: "Date" }]);
  });
});

describe("SELECT", () => {
  it("replaces the selection and closes", () => {
    const state = run(withOptions(), { type: "OPEN" }, { type: "SELECT", value: "banana" });

    expect(formValues(state)).toEqual(["banana"]);
    expect(state.open).toBe(false);
    expect(state.dirty).toBe(true);
  });

  it("ignores disabled options, missing options, multiple mode and a disabled select", () => {
    const single = withOptions();
    const multiple = withOptions({ multiple: true });
    const disabled = withOptions({ disabled: true });

    expectNoChange(single, { type: "SELECT", value: "cherry" });
    expectNoChange(single, { type: "SELECT", value: "zzz" });
    expectNoChange(multiple, { type: "SELECT", value: "apple" });
    expectNoChange(disabled, { type: "SELECT", value: "apple" });
  });
});

describe("TOGGLE", () => {
  it("adds and removes values in selection order and stays open", () => {
    let state = run(withOptions({ multiple: true }), { type: "OPEN" });
    state = run(state, { type: "TOGGLE", value: "date" }, { type: "TOGGLE", value: "apple" });

    expect(formValues(state)).toEqual(["date", "apple"]);
    expect(state.open).toBe(true);

    state = run(state, { type: "TOGGLE", value: "date" });

    expect(formValues(state)).toEqual(["apple"]);
  });

  it("ignores single mode and disabled options", () => {
    const single = withOptions();
    const multiple = withOptions({ multiple: true });

    expectNoChange(single, { type: "TOGGLE", value: "apple" });
    expectNoChange(multiple, { type: "TOGGLE", value: "cherry" });
  });
});

describe("SELECT_HIGHLIGHTED", () => {
  it("selects in single mode and toggles in multiple mode", () => {
    const single = run(withOptions(), { type: "OPEN" }, { type: "SELECT_HIGHLIGHTED" });
    const multiple = run(
      withOptions({ multiple: true }),
      { type: "OPEN" },
      { type: "SELECT_HIGHLIGHTED" },
    );

    expect(formValues(single)).toEqual(["apple"]);
    expect(single.open).toBe(false);
    expect(formValues(multiple)).toEqual(["apple"]);
    expect(multiple.open).toBe(true);
  });

  it("does nothing without a highlight", () => {
    const state = withOptions();

    expectNoChange(state, { type: "SELECT_HIGHLIGHTED" });
  });
});

describe("CLEAR", () => {
  it("empties the selection", () => {
    const state = run(withOptions(), { type: "SELECT", value: "apple" }, { type: "CLEAR" });

    expect(state.selection).toEqual([]);
    expect(state.dirty).toBe(true);
  });

  it("is ignored while disabled", () => {
    let state = run(withOptions(), { type: "SELECT", value: "apple" });
    state = run(state, { type: "CONFIG", config: { disabled: true } });

    expectNoChange(state, { type: "CLEAR" });
  });
});

describe("OPEN and CLOSE", () => {
  it("highlights the selected option", () => {
    const state = run(withOptions(), { type: "SELECT", value: "date" }, { type: "OPEN" });

    expect(state.highlighted).toBe("date");
  });

  it("highlights the first enabled option without a selection", () => {
    const state = withOptions({}, [option("a", "A", { disabled: true }), option("b", "B")]);

    expect(run(state, { type: "OPEN" }).highlighted).toBe("b");
  });

  it("highlights the first or last enabled option on request", () => {
    expect(run(withOptions(), { type: "OPEN", highlight: "first" }).highlighted).toBe("apple");
    expect(run(withOptions(), { type: "OPEN", highlight: "last" }).highlighted).toBe("date");
  });

  it("opens with nothing highlighted when there are no enabled options", () => {
    const state = run(createState(), { type: "OPEN" });

    expect(state.open).toBe(true);
    expect(state.highlighted).toBe(null);
  });

  it("is ignored while disabled", () => {
    const state = withOptions({ disabled: true });

    expectNoChange(state, { type: "OPEN" });
  });

  it("CLOSE clears the highlight and query, and is a no-op when closed", () => {
    const closed = withOptions();
    const state = run(
      withOptions({ searchable: true }),
      { type: "QUERY", text: "a" },
      { type: "CLOSE" },
    );

    expect(state.highlighted).toBe(null);
    expect(state.query).toBe(null);
    expectNoChange(closed, { type: "CLOSE" });
  });
});

describe("HIGHLIGHT", () => {
  it("only opens when closed, without moving the highlight", () => {
    const state = run(
      withOptions(),
      { type: "SELECT", value: "banana" },
      { type: "HIGHLIGHT", to: "next" },
    );

    expect(state.open).toBe(true);
    expect(state.highlighted).toBe("banana");
  });

  it("opens at the first or last option for Home / End", () => {
    const state = run(
      withOptions(),
      { type: "SELECT", value: "banana" },
      { type: "HIGHLIGHT", to: "last" },
    );

    expect(state.highlighted).toBe("date");
  });

  it("moves next / prev, skipping disabled options and wrapping", () => {
    let state = run(withOptions(), { type: "OPEN" });

    state = run(state, { type: "HIGHLIGHT", to: "next" });
    expect(state.highlighted).toBe("banana");

    state = run(state, { type: "HIGHLIGHT", to: "next" });
    expect(state.highlighted).toBe("date");

    state = run(state, { type: "HIGHLIGHT", to: "next" });
    expect(state.highlighted).toBe("apple");

    state = run(state, { type: "HIGHLIGHT", to: "prev" });
    expect(state.highlighted).toBe("date");
  });

  it("moves by pages and clamps", () => {
    const many: Option[] = [];

    for (let i = 0; i < 25; i++) {
      many.push(option(`v${i}`, `Value ${i}`));
    }

    let state = run(withOptions({}, many), { type: "OPEN" });

    state = run(state, { type: "HIGHLIGHT", to: "pageNext" });
    expect(state.highlighted).toBe("v10");

    state = run(
      state,
      { type: "HIGHLIGHT", to: "pageNext" },
      { type: "HIGHLIGHT", to: "pageNext" },
    );
    expect(state.highlighted).toBe("v24");

    state = run(state, { type: "HIGHLIGHT", to: "pagePrev" });
    expect(state.highlighted).toBe("v14");
  });

  it("highlights a value on hover only if it's enabled and visible", () => {
    const state = run(withOptions(), { type: "OPEN" });

    expect(run(state, { type: "HIGHLIGHT", value: "date" }).highlighted).toBe("date");
    expectNoChange(state, { type: "HIGHLIGHT", value: "cherry" });
    expect(run(withOptions(), { type: "HIGHLIGHT", value: "date" }).open).toBe(false);
  });
});

describe("TYPEAHEAD", () => {
  const names = [
    option("bob", "Bob"),
    option("anna", "Anna"),
    option("adam", "Adam"),
    option("alice", "Alice"),
  ];

  it("opens and highlights the first matching label", () => {
    const state = run(withOptions({}, names), { type: "TYPEAHEAD", text: "a" });

    expect(state.open).toBe(true);
    expect(state.highlighted).toBe("anna");
  });

  it("cycles through matches when the same key repeats", () => {
    let state = run(withOptions({}, names), { type: "TYPEAHEAD", text: "a" });

    state = run(state, { type: "TYPEAHEAD", text: "aa" });
    expect(state.highlighted).toBe("adam");

    state = run(state, { type: "TYPEAHEAD", text: "aaa" });
    expect(state.highlighted).toBe("alice");

    state = run(state, { type: "TYPEAHEAD", text: "aaaa" });
    expect(state.highlighted).toBe("anna");
  });

  it("matches longer prefixes, keeping the current option while it matches", () => {
    let state = run(withOptions({}, names), { type: "TYPEAHEAD", text: "a" });

    state = run(state, { type: "TYPEAHEAD", text: "an" });
    expect(state.highlighted).toBe("anna");

    state = run(state, { type: "TYPEAHEAD", text: "al" });
    expect(state.highlighted).toBe("alice");
  });

  it("keeps the highlight when nothing matches, and is ignored when searchable", () => {
    const opened = run(withOptions({}, names), { type: "OPEN" });
    const searchable = withOptions({ searchable: true }, names);

    expect(run(opened, { type: "TYPEAHEAD", text: "z" }).highlighted).toBe("bob");
    expectNoChange(searchable, { type: "TYPEAHEAD", text: "a" });
  });
});

describe("QUERY", () => {
  it("opens, filters by label and highlights the first match", () => {
    const state = run(withOptions({ searchable: true }), { type: "QUERY", text: "AN" });

    expect(state.open).toBe(true);
    expect(visibleOptions(state)).toEqual([option("banana", "Banana")]);
    expect(state.highlighted).toBe("banana");
  });

  it("shows all options when filtering is off", () => {
    const state = run(withOptions({ searchable: true, filter: false }), {
      type: "QUERY",
      text: "zzz",
    });

    expect(visibleOptions(state)).toEqual(fruits);
  });

  it("highlights nothing when nothing matches", () => {
    const state = run(withOptions({ searchable: true }), { type: "QUERY", text: "zzz" });

    expect(state.highlighted).toBe(null);
  });

  it("is ignored when not searchable", () => {
    const state = withOptions();

    expectNoChange(state, { type: "QUERY", text: "a" });
  });
});

describe("BLUR", () => {
  it("clears a searchable single selection when the text was erased", () => {
    let state = run(withOptions({ searchable: true }), { type: "SELECT", value: "apple" });
    state = run(state, { type: "QUERY", text: "" }, { type: "BLUR" });

    expect(state.selection).toEqual([]);
    expect(state.open).toBe(false);
  });

  it("keeps the selection when other text was typed", () => {
    let state = run(withOptions({ searchable: true }), { type: "SELECT", value: "apple" });
    state = run(state, { type: "QUERY", text: "ban" }, { type: "BLUR" });

    expect(formValues(state)).toEqual(["apple"]);
    expect(state.query).toBe(null);
  });

  it("only closes otherwise", () => {
    const state = run(
      withOptions(),
      { type: "SELECT", value: "apple" },
      { type: "OPEN" },
      { type: "BLUR" },
    );

    expect(formValues(state)).toEqual(["apple"]);
    expect(state.open).toBe(false);
  });
});

describe("CONFIG", () => {
  it("keeps the first selected value when multiple is turned off", () => {
    let state = run(withOptions({ multiple: true }), {
      type: "SET_VALUE",
      values: ["date", "apple"],
    });
    state = run(state, { type: "CONFIG", config: { multiple: false } });

    expect(formValues(state)).toEqual(["date"]);
  });

  it("closes when disabled", () => {
    const state = run(
      withOptions(),
      { type: "OPEN" },
      { type: "CONFIG", config: { disabled: true } },
    );

    expect(state.open).toBe(false);
  });

  it("drops the query when searchable is turned off, keeping a still-valid highlight", () => {
    let state = run(withOptions({ searchable: true }), { type: "QUERY", text: "an" });
    state = run(state, { type: "CONFIG", config: { searchable: false } });

    expect(state.query).toBe(null);
    expect(visibleOptions(state)).toEqual(fruits);
    expect(state.highlighted).toBe("banana");
  });
});

describe("RESET", () => {
  it("goes back to options marked selected and becomes clean", () => {
    let state = withOptions({}, [option("a", "A"), option("b", "B", { defaultSelected: true })]);
    state = run(state, { type: "SELECT", value: "a" }, { type: "RESET" });

    expect(formValues(state)).toEqual(["b"]);
    expect(state.dirty).toBe(false);
  });

  it("is empty without options marked selected", () => {
    const state = run(withOptions(), { type: "SELECT", value: "apple" }, { type: "RESET" });

    expect(state.selection).toEqual([]);
  });
});

describe("reduce", () => {
  it("changes the state in place and reports the changed fields", () => {
    const state = run(withOptions(), { type: "OPEN" });
    const changes = reduce(state, { type: "SELECT", value: "banana" });

    expect(state.selection).toEqual([{ value: "banana", label: "Banana" }]);
    expect([...changes].sort()).toEqual(["dirty", "highlighted", "open", "selection"]);
  });

  it("throws on unknown actions", () => {
    // @ts-expect-error: testing an invalid action
    expect(() => reduce(createState(), { type: "NOPE" })).toThrow(/Unknown action/);
  });
});

describe("random action sequences", () => {
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

  const values = ["a", "b", "c", "d", "e"];
  const userActions = new Set([
    "SELECT",
    "TOGGLE",
    "SELECT_HIGHLIGHTED",
    "CLEAR",
    "OPEN",
    "HIGHLIGHT",
    "TYPEAHEAD",
    "QUERY",
  ]);

  function randomAction(random: () => number): Action {
    function pick<T>(items: readonly T[]): T {
      return items[Math.floor(random() * items.length)] as T;
    }

    function randomValues() {
      const result: string[] = [];
      const count = Math.floor(random() * 3);

      for (let i = 0; i < count; i++) {
        result.push(pick(values));
      }

      return result;
    }

    const type = pick([
      "OPTIONS_CHANGED",
      "SET_VALUE",
      "SELECT",
      "TOGGLE",
      "SELECT_HIGHLIGHTED",
      "CLEAR",
      "OPEN",
      "CLOSE",
      "HIGHLIGHT",
      "HIGHLIGHT_VALUE",
      "TYPEAHEAD",
      "QUERY",
      "BLUR",
      "CONFIG",
      "RESET",
      "RESTORE",
    ] as const);

    switch (type) {
      case "OPTIONS_CHANGED": {
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

        return { type, options };
      }
      case "SET_VALUE":
      case "RESTORE":
        return { type, values: randomValues() };
      case "SELECT":
      case "TOGGLE":
        return { type, value: pick(values) };
      case "OPEN":
        return { type, highlight: pick([undefined, "first", "last"] as const) };
      case "HIGHLIGHT":
        return {
          type,
          to: pick(["next", "prev", "first", "last", "pageNext", "pagePrev"] as const),
        };
      case "HIGHLIGHT_VALUE":
        return { type: "HIGHLIGHT", value: pick(values) };
      case "TYPEAHEAD":
        return { type, text: pick(["a", "aa", "b", "av", "z"]) };
      case "QUERY":
        return { type, text: pick(["", "a", "an", "zzz"]) };
      case "CONFIG":
        return {
          type,
          config: {
            [pick(["multiple", "searchable", "filter", "disabled"] as const)]: random() < 0.5,
          } as Partial<Config>,
        };
      default:
        return { type } as Action;
    }
  }

  for (const seed of [1, 2, 3, 4, 5]) {
    it(`keeps every invariant (seed ${seed})`, () => {
      const random = createRandom(seed);
      const state = createState();

      for (let step = 0; step < 2000; step++) {
        const action = randomAction(random);
        const before = structuredClone(state);
        const changes = reduce(state, action);
        const context = `seed ${seed}, step ${step}, ${JSON.stringify(action)}`;

        try {
          checkInvariants(state);
        } catch (error) {
          throw new Error(`${(error as Error).message} (${context})`, { cause: error });
        }

        // Exactly the fields that differ are reported.
        for (const field of Object.keys(state) as (keyof State)[]) {
          const differs = JSON.stringify(before[field]) !== JSON.stringify(state[field]);
          expect(changes.has(field), `${field}: ${context}`).toBe(differs);
        }

        if (before.config.disabled && userActions.has(action.type)) {
          expect([...changes], context).toEqual([]);
        }

        if (action.type === "OPTIONS_CHANGED" && before.dirty) {
          expect(formValues(state), context).toEqual(formValues(before));
        }
      }
    });
  }
});
