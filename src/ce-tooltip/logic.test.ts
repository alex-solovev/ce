import { describe, expect, it } from "vite-plus/test";
import * as logic from "./logic.ts";
import type { Changes, State } from "./logic.ts";

/** Asserts the step reports no changes and leaves the state untouched. */
function expectNoChange(state: State, step: (state: State) => Changes): void {
  const before = structuredClone(state);
  const changes = step(state);

  expect([...changes]).toEqual([]);
  expect(state).toEqual(before);
}

describe("createState", () => {
  it("starts closed, enabled and untouched", () => {
    expect(logic.createState()).toEqual({
      open: false,
      disabled: false,
      triggerHovered: false,
      tooltipHovered: false,
      focused: false,
      dismissed: false,
    });
  });
});

describe("hover", () => {
  it("records the trigger and the tooltip separately", () => {
    const state = logic.createState();

    expect([...logic.hover(state, "trigger", true)]).toEqual(["triggerHovered"]);
    expect([...logic.hover(state, "tooltip", true)]).toEqual(["tooltipHovered"]);
    expect(state).toMatchObject({ triggerHovered: true, tooltipHovered: true });

    logic.hover(state, "trigger", false);

    expect(state).toMatchObject({ triggerHovered: false, tooltipHovered: true });
  });

  it("doesn't open by itself: the delay decides when", () => {
    const state = logic.createState();

    logic.hover(state, "trigger", true);

    expect(state.open).toBe(false);
  });

  it("reports nothing when nothing changed", () => {
    const state = logic.createState();

    expectNoChange(state, (s) => logic.hover(s, "trigger", false));
  });

  it("forgets an Escape once the pointer and focus have left", () => {
    const state = logic.createState();
    logic.hover(state, "trigger", true);
    logic.setOpen(state, true);
    logic.dismiss(state);

    logic.hover(state, "trigger", false);

    expect(state.dismissed).toBe(false);
  });

  it("remembers an Escape while focus stays", () => {
    const state = logic.createState();
    logic.hover(state, "trigger", true);
    logic.focus(state, true);
    logic.setOpen(state, true);
    logic.dismiss(state);

    logic.hover(state, "trigger", false);

    expect(state.dismissed).toBe(true);
  });
});

describe("focus", () => {
  it("records focus on the trigger", () => {
    const state = logic.createState();

    expect([...logic.focus(state, true)]).toEqual(["focused"]);
    expect([...logic.focus(state, false)]).toEqual(["focused"]);
    expectNoChange(state, (s) => logic.focus(s, false));
  });

  it("forgets an Escape once focus and the pointer have left", () => {
    const state = logic.createState();
    logic.focus(state, true);
    logic.setOpen(state, true);
    logic.dismiss(state);

    logic.focus(state, false);

    expect(state.dismissed).toBe(false);
  });
});

describe("dismiss", () => {
  it("closes and stays closed while hovered or focused", () => {
    const state = logic.createState();
    logic.hover(state, "trigger", true);
    logic.setOpen(state, true);

    expect([...logic.dismiss(state)].sort()).toEqual(["dismissed", "open"]);
    expect(state.open).toBe(false);
    expect(logic.shouldBeOpen(state)).toBe(false);
  });

  it("cancels a pending show", () => {
    const state = logic.createState();
    logic.focus(state, true);

    logic.dismiss(state);

    expect(logic.shouldBeOpen(state)).toBe(false);
  });

  it("does nothing when neither open nor wanted", () => {
    const state = logic.createState();

    expectNoChange(state, (s) => logic.dismiss(s));
  });
});

describe("setDisabled", () => {
  it("closes, and keeps it closed while disabled", () => {
    const state = logic.createState();
    logic.hover(state, "trigger", true);
    logic.setOpen(state, true);

    expect([...logic.setDisabled(state, true)].sort()).toEqual(["disabled", "open"]);
    expect(logic.shouldBeOpen(state)).toBe(false);
    expectNoChange(state, (s) => logic.setOpen(s, true));

    logic.setDisabled(state, false);

    expect(logic.shouldBeOpen(state)).toBe(true);
  });
});

describe("setOpen", () => {
  it("opens and closes", () => {
    const state = logic.createState();

    expect([...logic.setOpen(state, true)]).toEqual(["open"]);
    expect([...logic.setOpen(state, false)]).toEqual(["open"]);
    expectNoChange(state, (s) => logic.setOpen(s, false));
  });
});

describe("shouldBeOpen", () => {
  it("is wanted while the trigger, the tooltip or focus is held", () => {
    const state = logic.createState();

    expect(logic.shouldBeOpen(state)).toBe(false);

    logic.hover(state, "trigger", true);
    expect(logic.shouldBeOpen(state)).toBe(true);

    logic.hover(state, "trigger", false);
    logic.hover(state, "tooltip", true);
    expect(logic.shouldBeOpen(state)).toBe(true);

    logic.hover(state, "tooltip", false);
    logic.focus(state, true);
    expect(logic.shouldBeOpen(state)).toBe(true);
  });
});

describe("position", () => {
  it("maps each placement to an area and the flip that keeps its axis", () => {
    expect(logic.position("top")).toEqual({ area: "top", fallback: "flip-block" });
    expect(logic.position("bottom")).toEqual({ area: "bottom", fallback: "flip-block" });
    expect(logic.position("left")).toEqual({ area: "left", fallback: "flip-inline" });
    expect(logic.position("right")).toEqual({ area: "right", fallback: "flip-inline" });
  });

  it("falls back to top for a missing or unknown placement", () => {
    expect(logic.position(null)).toEqual({ area: "top", fallback: "flip-block" });
    expect(logic.position("middle")).toEqual({ area: "top", fallback: "flip-block" });
  });
});

describe("parseDelay", () => {
  it("reads milliseconds, falling back for missing, invalid or negative values", () => {
    expect(logic.parseDelay("300", 150)).toBe(300);
    expect(logic.parseDelay("0", 150)).toBe(0);
    expect(logic.parseDelay(null, 150)).toBe(150);
    expect(logic.parseDelay("", 150)).toBe(150);
    expect(logic.parseDelay("soon", 150)).toBe(150);
    expect(logic.parseDelay("-5", 150)).toBe(150);
  });
});
