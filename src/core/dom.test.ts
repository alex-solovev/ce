import { describe, expect, it } from "vite-plus/test";
import { defineElement, requireElement, setState, slottedText } from "./dom.ts";

function fragment(html: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
}

describe("requireElement", () => {
  it("returns the matching element", () => {
    const root = fragment(`<input id="name" />`);

    expect(requireElement(root, "#name", HTMLInputElement).id).toBe("name");
  });

  it("throws when nothing matches", () => {
    const root = fragment(`<span></span>`);

    expect(() => requireElement(root, "input", HTMLInputElement)).toThrow(
      'Expected a HTMLInputElement matching "input"',
    );
  });

  it("throws when the element has the wrong type", () => {
    const root = fragment(`<span id="name"></span>`);

    expect(() => requireElement(root, "#name", HTMLInputElement)).toThrow(/HTMLInputElement/);
  });
});

describe("slottedText", () => {
  const host = fragment(`
    <span slot="start">Icon</span>
    Green
    <b>pe</b>ar
    <!-- comment -->
    <span slot="description">Soft</span>
    <span slot="description">and  juicy</span>
  `);

  it("reads inline default slot content, skipping named slots and comments", () => {
    expect(slottedText(host)).toBe("Green pear");
  });

  it("joins elements of a named slot with spaces", () => {
    expect(slottedText(host, "description")).toBe("Soft and juicy");
  });

  it("is empty for a slot without content", () => {
    expect(slottedText(host, "end")).toBe("");
  });
});

describe("setState", () => {
  it("adds and removes a custom state", () => {
    class StatefulElement extends HTMLElement {
      internals: ElementInternals = this.attachInternals();
    }

    customElements.define("stateful-element", StatefulElement);

    const element = new StatefulElement();

    setState(element.internals, "open", true);
    expect(element.matches(":state(open)")).toBe(true);

    setState(element.internals, "open", false);
    expect(element.matches(":state(open)")).toBe(false);
  });
});

describe("defineElement", () => {
  it("registers once and ignores later definitions of the same tag", () => {
    class First extends HTMLElement {}
    class Second extends HTMLElement {}

    defineElement("define-element-test", First);
    defineElement("define-element-test", Second);

    expect(customElements.get("define-element-test")).toBe(First);
  });
});
