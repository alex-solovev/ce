import { describe, expect, it } from "vite-plus/test";
import {
  clearHighlight,
  createListNavigation,
  createTypeaheadBuffer,
  highlightValue,
  moveHighlight,
  navigationKey,
  pushTypeahead,
  setItems,
  typeahead,
} from "./list-navigation.ts";
import type { ListNavigation, ListNavigationOptions, NavigationItem } from "./list-navigation.ts";

function item(value: string, label: string, disabled = false): NavigationItem {
  return { value, label, disabled };
}

const fruits = [
  item("apple", "Apple"),
  item("banana", "Banana"),
  item("cherry", "Cherry", true),
  item("date", "Date"),
];

function withItems(
  items: NavigationItem[] = fruits,
  options: ListNavigationOptions = {},
): ListNavigation {
  const nav = createListNavigation(options);
  setItems(nav, items);
  return nav;
}

describe("createListNavigation", () => {
  it("starts empty, wrapping, with pages of 10", () => {
    expect(createListNavigation()).toEqual({
      items: [],
      highlighted: null,
      wrap: true,
      pageSize: 10,
    });
  });
});

describe("moveHighlight", () => {
  it("goes to the first item on next, and the last on prev, when nothing is highlighted", () => {
    const next = withItems();
    const prev = withItems();

    expect(moveHighlight(next, "next")).toBe(true);
    expect(next.highlighted).toBe("apple");

    expect(moveHighlight(prev, "prev")).toBe(true);
    expect(prev.highlighted).toBe("date");
  });

  it("skips disabled items and wraps", () => {
    const nav = withItems();
    highlightValue(nav, "banana");

    moveHighlight(nav, "next");
    expect(nav.highlighted).toBe("date");

    moveHighlight(nav, "next");
    expect(nav.highlighted).toBe("apple");

    moveHighlight(nav, "prev");
    expect(nav.highlighted).toBe("date");
  });

  it("stops at the ends without wrap", () => {
    const nav = withItems(fruits, { wrap: false });
    highlightValue(nav, "date");

    expect(moveHighlight(nav, "next")).toBe(false);
    expect(nav.highlighted).toBe("date");

    highlightValue(nav, "apple");

    expect(moveHighlight(nav, "prev")).toBe(false);
    expect(nav.highlighted).toBe("apple");
  });

  it("goes to the first and last enabled items", () => {
    const nav = withItems([
      item("a", "A", true),
      item("b", "B"),
      item("c", "C"),
      item("d", "D", true),
    ]);

    moveHighlight(nav, "first");
    expect(nav.highlighted).toBe("b");

    moveHighlight(nav, "last");
    expect(nav.highlighted).toBe("c");
  });

  it("moves by pages and clamps", () => {
    const many: NavigationItem[] = [];

    for (let i = 0; i < 25; i++) {
      many.push(item(`v${i}`, `Value ${i}`));
    }

    const nav = withItems(many, { pageSize: 10 });
    moveHighlight(nav, "first");

    moveHighlight(nav, "pageNext");
    expect(nav.highlighted).toBe("v10");

    moveHighlight(nav, "pageNext");
    moveHighlight(nav, "pageNext");
    expect(nav.highlighted).toBe("v24");

    moveHighlight(nav, "pagePrev");
    expect(nav.highlighted).toBe("v14");
  });

  it("does nothing without enabled items", () => {
    const nav = withItems([item("a", "A", true)]);

    expect(moveHighlight(nav, "next")).toBe(false);
    expect(nav.highlighted).toBe(null);
  });
});

describe("highlightValue and clearHighlight", () => {
  it("highlights enabled items only", () => {
    const nav = withItems();

    expect(highlightValue(nav, "date")).toBe(true);
    expect(highlightValue(nav, "date")).toBe(false);
    expect(highlightValue(nav, "cherry")).toBe(false);
    expect(highlightValue(nav, "missing")).toBe(false);
    expect(nav.highlighted).toBe("date");
  });

  it("clears the highlight", () => {
    const nav = withItems();
    highlightValue(nav, "apple");

    expect(clearHighlight(nav)).toBe(true);
    expect(clearHighlight(nav)).toBe(false);
    expect(nav.highlighted).toBe(null);
  });
});

describe("setItems", () => {
  it("reports whether the items changed", () => {
    const nav = withItems();

    expect(setItems(nav, [...fruits])).toBe(false);
    expect(setItems(nav, [item("apple", "Green apple")])).toBe(true);
  });

  it("keeps a highlight that's still enabled", () => {
    const nav = withItems();
    highlightValue(nav, "banana");

    setItems(nav, [item("banana", "Banana"), item("date", "Date")]);

    expect(nav.highlighted).toBe("banana");
  });

  it("moves a removed or disabled highlight to the next enabled item", () => {
    const nav = withItems();
    highlightValue(nav, "banana");

    expect(
      setItems(nav, [item("apple", "Apple"), item("banana", "Banana", true), item("date", "Date")]),
    ).toBe(true);
    expect(nav.highlighted).toBe("date");
  });

  it("falls back to the previous enabled item, then null", () => {
    const nav = withItems();
    highlightValue(nav, "date");

    setItems(nav, [item("apple", "Apple"), item("banana", "Banana")]);
    expect(nav.highlighted).toBe("banana");

    setItems(nav, []);
    expect(nav.highlighted).toBe(null);
  });
});

describe("typeahead", () => {
  const names = [
    item("bob", "Bob"),
    item("anna", "Anna"),
    item("adam", "Adam", true),
    item("alice", "Alice"),
  ];

  it("highlights the first matching label", () => {
    const nav = withItems(names);

    expect(typeahead(nav, "a")).toBe(true);
    expect(nav.highlighted).toBe("anna");
  });

  it("cycles through enabled matches when the same key repeats", () => {
    const nav = withItems(names);

    typeahead(nav, "a");
    typeahead(nav, "aa");
    expect(nav.highlighted).toBe("alice");

    typeahead(nav, "aaa");
    expect(nav.highlighted).toBe("anna");
  });

  it("keeps the current item while a longer prefix still matches", () => {
    const nav = withItems(names);

    typeahead(nav, "a");
    expect(typeahead(nav, "an")).toBe(false);
    expect(nav.highlighted).toBe("anna");

    typeahead(nav, "al");
    expect(nav.highlighted).toBe("alice");
  });

  it("keeps the highlight when nothing matches or the text is empty", () => {
    const nav = withItems(names);
    highlightValue(nav, "bob");

    expect(typeahead(nav, "z")).toBe(false);
    expect(typeahead(nav, "")).toBe(false);
    expect(nav.highlighted).toBe("bob");
  });
});

describe("navigationKey", () => {
  function key(name: string, modifiers: Partial<KeyboardEventInit> = {}) {
    return new KeyboardEvent("keydown", { key: name, ...modifiers });
  }

  it("maps vertical arrows and the shared keys", () => {
    expect(navigationKey(key("ArrowDown"), "vertical")).toBe("next");
    expect(navigationKey(key("ArrowUp"), "vertical")).toBe("prev");
    expect(navigationKey(key("Home"), "vertical")).toBe("first");
    expect(navigationKey(key("End"), "vertical")).toBe("last");
    expect(navigationKey(key("PageDown"), "vertical")).toBe("pageNext");
    expect(navigationKey(key("PageUp"), "vertical")).toBe("pagePrev");
    expect(navigationKey(key("ArrowRight"), "vertical")).toBe(null);
  });

  it("maps horizontal arrows, swapped in right-to-left text", () => {
    expect(navigationKey(key("ArrowRight"), "horizontal")).toBe("next");
    expect(navigationKey(key("ArrowLeft"), "horizontal")).toBe("prev");
    expect(navigationKey(key("ArrowRight"), "horizontal", "rtl")).toBe("prev");
    expect(navigationKey(key("ArrowLeft"), "horizontal", "rtl")).toBe("next");
    expect(navigationKey(key("ArrowDown"), "horizontal")).toBe(null);
  });

  it("leaves keys with modifiers and other keys alone", () => {
    expect(navigationKey(key("ArrowDown", { altKey: true }), "vertical")).toBe(null);
    expect(navigationKey(key("Home", { ctrlKey: true }), "vertical")).toBe(null);
    expect(navigationKey(key("ArrowDown", { shiftKey: true }), "vertical")).toBe(null);
    expect(navigationKey(key("a"), "vertical")).toBe(null);
  });
});

describe("pushTypeahead", () => {
  it("collects keys typed within the timeout", () => {
    const buffer = createTypeaheadBuffer(500);

    expect(pushTypeahead(buffer, "a", 1000)).toBe("a");
    expect(pushTypeahead(buffer, "l", 1400)).toBe("al");
  });

  it("starts over after the timeout", () => {
    const buffer = createTypeaheadBuffer(500);

    pushTypeahead(buffer, "a", 1000);

    expect(pushTypeahead(buffer, "b", 1600)).toBe("b");
  });
});
