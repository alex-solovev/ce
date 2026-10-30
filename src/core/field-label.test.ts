import { afterEach, describe, expect, it } from "vite-plus/test";
import { labelMarkup, setupFieldLabel, updateFieldLabel } from "./field-label.ts";
import { query } from "./test-dom.ts";

afterEach(() => {
  document.body.replaceChildren();
});

/**
 * A plain host with `labelMarkup` and an input in its shadow root.
 * @param hostHtml Light DOM content of the host.
 */
function render(hostHtml = "") {
  const host = document.createElement("div");
  host.innerHTML = hostHtml;

  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `${labelMarkup}<input />`;

  document.body.append(host);

  const label = query(root, "label");
  const slot = query(root, "slot");
  const control = query(root, "input");

  return { host, root, label, slot, control };
}

function nextSlotchange(slot: HTMLSlotElement): Promise<Event> {
  return new Promise((resolve) => {
    slot.addEventListener("slotchange", resolve, { once: true });
  });
}

describe("updateFieldLabel", () => {
  it("shows the label attribute and names the control by it", () => {
    const { host, root, label, slot, control } = render();
    host.setAttribute("label", "First name");

    updateFieldLabel(host, root, control);

    expect(slot.textContent).toBe("First name");
    expect(label.hidden).toBe(false);
    expect(control.ariaLabelledByElements).toEqual([label]);
  });

  it("is hidden and names nothing without a label", () => {
    const { host, root, label, control } = render();

    updateFieldLabel(host, root, control);

    expect(label.hidden).toBe(true);
    expect(control.ariaLabelledByElements).toBe(null);
  });

  it("is shown for slotted content without the attribute", () => {
    const { host, root, label, control } = render(`<span slot="label">First name</span>`);

    updateFieldLabel(host, root, control);

    expect(label.hidden).toBe(false);
    expect(control.ariaLabelledByElements).toEqual([label]);
  });

  it("follows attribute changes and removal", () => {
    const { host, root, label, slot, control } = render();

    host.setAttribute("label", "First name");
    updateFieldLabel(host, root, control);

    host.setAttribute("label", "Given name");
    updateFieldLabel(host, root, control);

    expect(slot.textContent).toBe("Given name");

    host.removeAttribute("label");
    updateFieldLabel(host, root, control);

    expect(slot.textContent).toBe("");
    expect(label.hidden).toBe(true);
    expect(control.ariaLabelledByElements).toBe(null);
  });

  it("doesn't rewrite unchanged fallback text", () => {
    const { host, root, slot, control } = render();
    host.setAttribute("label", "First name");

    updateFieldLabel(host, root, control);
    const textNode = slot.firstChild;
    updateFieldLabel(host, root, control);

    // Rewriting would replace the node and fire slotchange again.
    expect(slot.firstChild).toBe(textNode);
  });

  it("throws when the shadow root has no labelMarkup", () => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<input />`;

    const control = query(root, "input");

    expect(() => updateFieldLabel(host, root, control)).toThrow(/label\[part='label'\]/);
  });
});

describe("setupFieldLabel", () => {
  it("focuses the control when the label is clicked", () => {
    const { host, root, label, control } = render();
    host.setAttribute("label", "First name");

    setupFieldLabel(host, root, control);
    updateFieldLabel(host, root, control);
    label.click();

    expect(root.activeElement).toBe(control);
  });

  it("updates when content is slotted or removed", async () => {
    const { host, root, label, slot, control } = render();

    setupFieldLabel(host, root, control);
    updateFieldLabel(host, root, control);

    expect(label.hidden).toBe(true);

    const content = document.createElement("span");
    content.slot = "label";
    content.textContent = "First name";

    host.append(content);
    await nextSlotchange(slot);

    expect(label.hidden).toBe(false);
    expect(control.ariaLabelledByElements).toEqual([label]);

    content.remove();
    await nextSlotchange(slot);

    expect(label.hidden).toBe(true);
    expect(control.ariaLabelledByElements).toBe(null);
  });
});
