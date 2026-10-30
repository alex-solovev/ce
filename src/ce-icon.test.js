import { afterEach, describe, expect, it } from "vite-plus/test";
import { cdp } from "vite-plus/test/browser/context";
import "./ce-icon.js";
import { registerIconLibrary } from "./icon-library.js";

const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" /></svg>`;
const circle = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" /></svg>`;

afterEach(() => {
  document.body.replaceChildren();
});

/**
 * @param {string} html
 * @returns {HTMLElement}
 */
function render(html) {
  document.body.innerHTML = html;

  const icon = document.querySelector("ce-icon");

  if (!icon) {
    throw new Error("No ce-icon rendered");
  }

  return icon;
}

/**
 * Images in Chrome's accessibility tree, as "role:name". Vitest's role
 * locators don't see ElementInternals semantics, so this asks the browser
 * through CDP (Chromium only).
 * @returns {Promise<string[]>}
 */
async function accessibleImages() {
  const { frameTree } = await cdp().send("Page.getFrameTree");

  // Tests run inside an iframe of the Vitest runner page.
  const frameId = frameTree.childFrames[0].frame.id;
  const { nodes } = await cdp().send("Accessibility.getFullAXTree", { frameId });

  /** @type {string[]} */
  const images = [];

  for (const node of nodes) {
    if (node.ignored || node.role?.value !== "image") {
      continue;
    }

    images.push(`image:${node.name?.value ?? ""}`);
  }

  return images;
}

/** @param {Element} icon */
function renderedSvg(icon) {
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

      expect(await accessibleImages()).toEqual(["image:Done"]);
    });

    it("follows label changes", async () => {
      const icon = render(`<ce-icon name="check" label="Done"></ce-icon>`);
      icon.setAttribute("label", "Complete");

      expect(await accessibleImages()).toEqual(["image:Complete"]);
    });

    it("isn't exposed without a label", async () => {
      render(`<ce-icon name="check"></ce-icon>`);

      expect(await accessibleImages()).toEqual([]);
    });
  });
});
