import { afterEach, describe, expect, it } from "vite-plus/test";
import { accessibleNodesWithRole } from "../core/test-accessibility.ts";
import { query } from "../core/test-dom.ts";
import "./ce-icon.ts";
import { registerIconLibrary } from "./icon-library.ts";

const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" /></svg>`;
const circle = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" /></svg>`;

afterEach(() => {
  document.body.replaceChildren();
});

function render(html: string): HTMLElement {
  document.body.innerHTML = html;

  return query(document, "ce-icon");
}

function renderedSvg(icon: Element): SVGSVGElement | null {
  return icon.shadowRoot?.querySelector("svg") ?? null;
}

describe("ce-icon", () => {
  it("renders an icon from the default library", () => {
    const icon = render(`<ce-icon name="check"></ce-icon>`);
    const svg = renderedSvg(icon);

    expect(svg).not.toBe(null);
    expect(svg?.part.contains("svg")).toBe(true);
  });

  it("renders an icon from a registered library", () => {
    registerIconLibrary("shapes", { square });

    const icon = render(`<ce-icon library="shapes" name="square"></ce-icon>`);

    expect(renderedSvg(icon)?.querySelector("rect")).not.toBe(null);
  });

  it("follows name changes", () => {
    registerIconLibrary("shapes", { square, circle });

    const icon = render(`<ce-icon library="shapes" name="square"></ce-icon>`);
    icon.setAttribute("name", "circle");

    expect(renderedSvg(icon)?.querySelector("circle")).not.toBe(null);
  });

  it("redraws when its library is registered later", () => {
    const icon = render(`<ce-icon library="late" name="square"></ce-icon>`);

    expect(renderedSvg(icon)).toBe(null);

    registerIconLibrary("late", { square });

    expect(renderedSvg(icon)?.querySelector("rect")).not.toBe(null);
  });

  it("redraws when its library is replaced", () => {
    registerIconLibrary("replaced", { shape: square });

    const icon = render(`<ce-icon library="replaced" name="shape"></ce-icon>`);

    registerIconLibrary("replaced", { shape: circle });

    expect(renderedSvg(icon)?.querySelector("circle")).not.toBe(null);
  });

  it("renders nothing for an unknown icon", () => {
    const icon = render(`<ce-icon name="does-not-exist"></ce-icon>`);

    expect(renderedSvg(icon)).toBe(null);
  });

  it("renders nothing when the markup isn't an SVG", () => {
    registerIconLibrary("broken", { text: `<span>not an svg</span>` });

    const icon = render(`<ce-icon library="broken" name="text"></ce-icon>`);

    expect(icon.shadowRoot?.childElementCount).toBe(0);
  });

  describe("label", () => {
    it("is exposed as a single image with the label", async () => {
      render(`<ce-icon name="check" label="Done"></ce-icon>`);

      expect(await accessibleNodesWithRole("image")).toEqual(["image:Done"]);
    });

    it("follows label changes", async () => {
      const icon = render(`<ce-icon name="check" label="Done"></ce-icon>`);
      icon.setAttribute("label", "Complete");

      expect(await accessibleNodesWithRole("image")).toEqual(["image:Complete"]);
    });

    it("isn't exposed without a label", async () => {
      render(`<ce-icon name="check"></ce-icon>`);

      expect(await accessibleNodesWithRole("image")).toEqual([]);
    });
  });
});
