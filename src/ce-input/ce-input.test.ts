import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";
import { accessibleNodesWithRole } from "../core/test-accessibility.ts";
import { query, queryShadow } from "../core/test-dom.ts";
import "./ce-input.ts";

afterEach(() => {
  document.body.replaceChildren();
});

function renderForm(html: string): HTMLFormElement {
  const form = document.createElement("form");
  form.innerHTML = html;

  // Keep submissions from navigating the test page.
  form.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  document.body.append(form);

  return form;
}

function innerInput(host: Element): HTMLInputElement {
  return queryShadow(host, "input");
}

describe("ce-input", () => {
  describe("value", () => {
    it("submits the value attribute by default", () => {
      const form = renderForm(`<ce-input name="first" value="Ada"></ce-input>`);

      expect(new FormData(form).get("first")).toBe("Ada");
    });

    it("submits what the user types", async () => {
      const form = renderForm(`<ce-input name="first"></ce-input>`);
      const input = query(form, "ce-input");

      await userEvent.click(innerInput(input));
      await userEvent.keyboard("Ada");

      expect(input.value).toBe("Ada");
      expect(new FormData(form).get("first")).toBe("Ada");
    });

    it("doesn't reflect the value property to the attribute", () => {
      const form = renderForm(`<ce-input name="first" value="Ada"></ce-input>`);
      const input = query(form, "ce-input");

      input.value = "Grace";

      expect(input.value).toBe("Grace");
      expect(input.getAttribute("value")).toBe("Ada");
      expect(innerInput(input).value).toBe("Grace");
    });

    it("follows the value attribute until the value is changed", () => {
      const form = renderForm(`<ce-input name="first" value="Ada"></ce-input>`);
      const input = query(form, "ce-input");

      input.setAttribute("value", "Grace");
      expect(input.value).toBe("Grace");

      input.value = "Hedy";
      input.setAttribute("value", "Barbara");
      expect(input.value).toBe("Hedy");
    });
  });

  describe("reset", () => {
    it("restores the value attribute", () => {
      const form = renderForm(`<ce-input name="first" value="Ada"></ce-input>`);
      const input = query(form, "ce-input");

      input.value = "Grace";
      form.reset();

      expect(input.value).toBe("Ada");
      expect(innerInput(input).value).toBe("Ada");
      expect(new FormData(form).get("first")).toBe("Ada");
    });
  });

  describe("disabled", () => {
    it("isn't submitted when disabled", () => {
      const form = renderForm(`<ce-input name="first" value="Ada" disabled></ce-input>`);
      const input = query(form, "ce-input");

      expect(new FormData(form).has("first")).toBe(false);
      expect(innerInput(input).disabled).toBe(true);
    });

    it("is disabled by a disabled fieldset", () => {
      const form = renderForm(`
        <fieldset>
          <ce-input name="first" value="Ada"></ce-input>
        </fieldset>
      `);
      const fieldset = query(form, "fieldset");
      const input = query(form, "ce-input");

      fieldset.disabled = true;

      expect(input.matches(":disabled")).toBe(true);
      expect(innerInput(input).disabled).toBe(true);
      expect(new FormData(form).has("first")).toBe(false);

      fieldset.disabled = false;

      expect(input.matches(":disabled")).toBe(false);
      expect(innerInput(input).disabled).toBe(false);
    });
  });

  describe("Enter", () => {
    it("submits the form", async () => {
      const form = renderForm(`<ce-input name="first"></ce-input>`);
      const input = query(form, "ce-input");
      let submitted = false;

      form.addEventListener("submit", () => {
        submitted = true;
      });

      await userEvent.click(innerInput(input));
      await userEvent.keyboard("{Enter}");

      expect(submitted).toBe(true);
    });

    it("doesn't submit when keydown is prevented", async () => {
      const form = renderForm(`<ce-input name="first"></ce-input>`);
      const input = query(form, "ce-input");
      let submitted = false;

      form.addEventListener("submit", () => {
        submitted = true;
      });

      // Listeners on the host only run before ours in the capture phase.
      input.addEventListener(
        "keydown",
        (event) => {
          event.preventDefault();
        },
        { capture: true },
      );

      await userEvent.click(innerInput(input));
      await userEvent.keyboard("{Enter}");

      expect(submitted).toBe(false);
    });
  });

  describe("start and end slots", () => {
    it("render inside the box", () => {
      const form = renderForm(`
        <ce-input name="query">
          <ce-icon slot="start" name="magnifying-glass"></ce-icon>
          <span slot="end">kg</span>
        </ce-input>
      `);
      const input = query(form, "ce-input");
      const base = queryShadow(input, "[part='base']");
      const start = query<HTMLSlotElement>(base, "slot[name='start']");
      const end = query<HTMLSlotElement>(base, "slot[name='end']");

      expect(start.assignedElements()).toEqual([query(form, "ce-icon")]);
      expect(end.assignedElements()).toEqual([query(form, "span")]);
    });

    it("focus the input when clicked", async () => {
      const form = renderForm(`
        <ce-input name="query">
          <ce-icon slot="start" name="magnifying-glass"></ce-icon>
        </ce-input>
      `);
      const input = query(form, "ce-input");

      await userEvent.click(query(form, "ce-icon"));

      expect(input.shadowRoot?.activeElement).toBe(innerInput(input));
    });
  });

  describe("clear button", () => {
    function clearButton(host: Element): HTMLButtonElement {
      return queryShadow<HTMLButtonElement>(host, "[part='clear-button']");
    }

    it("is hidden without with-clear", () => {
      const form = renderForm(`<ce-input name="query" value="cats"></ce-input>`);

      expect(clearButton(query(form, "ce-input")).hidden).toBe(true);
    });

    it("is shown only while there's a value", async () => {
      const form = renderForm(`<ce-input name="query" with-clear></ce-input>`);
      const input = query(form, "ce-input");

      expect(clearButton(input).hidden).toBe(true);

      await userEvent.click(innerInput(input));
      await userEvent.keyboard("cats");

      expect(clearButton(input).hidden).toBe(false);
    });

    it("is hidden when disabled", () => {
      const form = renderForm(
        `<ce-input name="query" value="cats" with-clear disabled></ce-input>`,
      );

      expect(clearButton(query(form, "ce-input")).hidden).toBe(true);
    });

    it("clears the value, fires input and change, and focuses the input", async () => {
      const form = renderForm(`<ce-input name="query" value="cats" with-clear></ce-input>`);
      const input = query(form, "ce-input");

      const events: string[] = [];

      input.addEventListener("input", () => {
        events.push("input");
      });

      input.addEventListener("change", () => {
        events.push("change");
      });

      await userEvent.click(clearButton(input));

      expect(input.value).toBe("");
      expect(innerInput(input).value).toBe("");
      expect(new FormData(form).get("query")).toBe("");
      expect(events).toEqual(["input", "change"]);
      expect(input.shadowRoot?.activeElement).toBe(innerInput(input));
      expect(clearButton(input).hidden).toBe(true);
    });
  });

  describe("label", () => {
    function label(host: Element): HTMLLabelElement {
      return queryShadow<HTMLLabelElement>(host, "[part='label']");
    }

    it("names the input by the label attribute", async () => {
      const form = renderForm(`<ce-input name="first" label="First name"></ce-input>`);

      expect(label(query(form, "ce-input")).hidden).toBe(false);
      expect(await accessibleNodesWithRole("textbox")).toEqual(["textbox:First name"]);
    });

    it("names the input by slotted label content", async () => {
      const form = renderForm(`
        <ce-input name="first" label="Ignored">
          <span slot="label">First <em>name</em></span>
        </ce-input>
      `);

      expect(label(query(form, "ce-input")).hidden).toBe(false);
      expect(await accessibleNodesWithRole("textbox")).toEqual(["textbox:First name"]);
    });

    it("follows label attribute changes", async () => {
      const form = renderForm(`<ce-input name="first" label="First name"></ce-input>`);
      const input = query(form, "ce-input");

      input.label = "Given name";

      expect(await accessibleNodesWithRole("textbox")).toEqual(["textbox:Given name"]);
    });

    it("focuses the input when clicked", async () => {
      const form = renderForm(`<ce-input name="first" label="First name"></ce-input>`);
      const input = query(form, "ce-input");

      await userEvent.click(label(input));

      expect(input.shadowRoot?.activeElement).toBe(innerInput(input));
    });

    it("is hidden without a label, leaving the placeholder as the name", async () => {
      const form = renderForm(`<ce-input name="query" placeholder="Search"></ce-input>`);

      expect(label(query(form, "ce-input")).hidden).toBe(true);
      expect(await accessibleNodesWithRole("textbox")).toEqual(["textbox:Search"]);
    });
  });
});
