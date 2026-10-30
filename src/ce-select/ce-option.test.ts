import { afterEach, describe, expect, it } from "vite-plus/test";
import { accessibleNodeDetails } from "../core/test-accessibility.ts";
import type { AccessibleNode } from "../core/test-accessibility.ts";
import { query, queryShadow } from "../core/test-dom.ts";
import "./ce-option.ts";
import type { CeOption, OptionView } from "./ce-option.ts";

afterEach(() => {
  document.body.replaceChildren();
});

/** Renders options inside a listbox, so they're valid in the accessibility tree. */
function render(html: string): CeOption {
  document.body.innerHTML = `<div role="listbox" aria-label="Fruit">${html}</div>`;

  return query(document, "ce-option");
}

async function accessibleOptions(): Promise<AccessibleNode[]> {
  const result: AccessibleNode[] = [];

  for (const node of await accessibleNodeDetails()) {
    if (node.role !== "option") {
      continue;
    }

    result.push(node);
  }

  return result;
}

const plainView: OptionView = {
  selected: false,
  highlighted: false,
  filteredOut: false,
  showCheck: false,
};

describe("ce-option", () => {
  describe("label", () => {
    it("is the default slot's text, with whitespace collapsed", () => {
      const option = render(`
        <ce-option value="pear">
          <ce-icon slot="start" name="check"></ce-icon>
          Green
          <b>pear</b>
          <!-- not part of the label -->
          <span slot="description">Soft and juicy</span>
        </ce-option>
      `);

      expect(option.label).toBe("Green pear");
    });

    it("is the accessible name, without the description or icons", async () => {
      render(`
        <ce-option value="pear">
          <ce-icon slot="start" name="check"></ce-icon>
          Pear
          <span slot="description">Soft and juicy</span>
        </ce-option>
      `);

      expect(await accessibleOptions()).toEqual([
        {
          role: "option",
          name: "Pear",
          description: "Soft and juicy",
          selected: false,
          disabled: false,
        },
      ]);
    });

    it("updates the accessible name on refresh after a text edit", async () => {
      const option = render(`<ce-option value="pear"><span>Pear</span></ce-option>`);

      query(option, "span").textContent = "Nashi pear";
      option.refresh();

      expect(await accessibleOptions()).toEqual([
        { role: "option", name: "Nashi pear", description: "", selected: false, disabled: false },
      ]);
    });
  });

  describe("description", () => {
    it("is the description slot's text, shown only when present", () => {
      const withDescription = render(`
        <ce-option>Pear<span slot="description">Soft, <em>juicy</em></span></ce-option>
      `);

      expect(withDescription.description).toBe("Soft, juicy");
      expect(queryShadow<HTMLElement>(withDescription, "[part='description']").hidden).toBe(false);

      const without = render(`<ce-option>Apple</ce-option>`);

      expect(without.description).toBe("");
      expect(queryShadow<HTMLElement>(without, "[part='description']").hidden).toBe(true);
    });

    it("appears when description content is added later", async () => {
      const option = render(`<ce-option>Pear</ce-option>`);
      const description = document.createElement("span");
      description.slot = "description";
      description.textContent = "Soft";

      const slotchange = new Promise((resolve) => {
        queryShadow(option, "slot[name='description']").addEventListener("slotchange", resolve, {
          once: true,
        });
      });

      option.append(description);
      await slotchange;

      expect(queryShadow<HTMLElement>(option, "[part='description']").hidden).toBe(false);
      expect(await accessibleOptions()).toEqual([
        { role: "option", name: "Pear", description: "Soft", selected: false, disabled: false },
      ]);
    });
  });

  describe("attributes", () => {
    it("uses the label as the value by default", () => {
      expect(render(`<ce-option>Apple</ce-option>`).value).toBe("Apple");
      expect(render(`<ce-option value="apple">Apple</ce-option>`).value).toBe("apple");
    });

    it("reflects disabled and selected (the default selection)", () => {
      const option = render(`<ce-option selected>Apple</ce-option>`);

      expect(option.defaultSelected).toBe(true);
      expect(option.selected).toBe(false);

      option.disabled = true;

      expect(option.hasAttribute("disabled")).toBe(true);
    });

    it("exposes disabled to assistive technology", async () => {
      render(`<ce-option disabled>Apple</ce-option>`);

      const [option] = await accessibleOptions();

      expect(option?.disabled).toBe(true);
    });
  });

  describe("setView", () => {
    it("sets the selected, highlighted and filtered-out states", () => {
      const option = render(`<ce-option>Apple</ce-option>`);

      option.setView({ ...plainView, selected: true, highlighted: true });

      expect(option.selected).toBe(true);
      expect(option.matches(":state(selected)")).toBe(true);
      expect(option.matches(":state(highlighted)")).toBe(true);

      option.setView({ ...plainView, filteredOut: true });

      expect(option.selected).toBe(false);
      expect(option.matches(":state(highlighted)")).toBe(false);
      expect(getComputedStyle(option).display).toBe("none");
    });

    it("shows the check mark only for selected options in multiple mode", () => {
      const option = render(`<ce-option>Apple</ce-option>`);
      const check = queryShadow(option, "[part='check']");

      option.setView({ ...plainView, selected: true });
      expect(getComputedStyle(check).display).toBe("none");

      option.setView({ ...plainView, showCheck: true });
      expect(getComputedStyle(check).visibility).toBe("hidden");

      option.setView({ ...plainView, showCheck: true, selected: true });
      expect(getComputedStyle(check).visibility).toBe("visible");
    });

    it("exposes the selection to assistive technology", async () => {
      const option = render(`<ce-option>Apple</ce-option>`);

      option.setView({ ...plainView, selected: true });

      const [node] = await accessibleOptions();

      expect(node?.selected).toBe(true);
    });
  });
});
