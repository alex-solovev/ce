import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";
import "./ce-input.js";

afterEach(() => {
  document.body.replaceChildren();
});

/**
 * @param {string} html
 * @returns {HTMLFormElement}
 */
function renderForm(html) {
  const form = document.createElement("form");
  form.innerHTML = html;

  // Keep submissions from navigating the test page.
  form.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  document.body.append(form);

  return form;
}

/**
 * @param {Element} host
 * @returns {HTMLInputElement}
 */
function innerInput(host) {
  const input = host.shadowRoot?.querySelector("input");

  if (!input) {
    throw new Error("ce-input has no inner input");
  }

  return input;
}

describe("ce-input", () => {
  describe("value", () => {
    it("submits the value attribute by default", () => {
      const form = renderForm(`<ce-input name="first" value="Ada"></ce-input>`);

      expect(new FormData(form).get("first")).toBe("Ada");
    });

    it("submits what the user types", async () => {
      const form = renderForm(`<ce-input name="first"></ce-input>`);
      const input = form.querySelector("ce-input");

      await userEvent.click(innerInput(input));
      await userEvent.keyboard("Ada");

      expect(input.value).toBe("Ada");
      expect(new FormData(form).get("first")).toBe("Ada");
    });

    it("doesn't reflect the value property to the attribute", () => {
      const form = renderForm(`<ce-input name="first" value="Ada"></ce-input>`);
      const input = form.querySelector("ce-input");

      input.value = "Grace";

      expect(input.value).toBe("Grace");
      expect(input.getAttribute("value")).toBe("Ada");
      expect(innerInput(input).value).toBe("Grace");
    });

    it("follows the value attribute until the value is changed", () => {
      const form = renderForm(`<ce-input name="first" value="Ada"></ce-input>`);
      const input = form.querySelector("ce-input");

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
      const input = form.querySelector("ce-input");

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
      const input = form.querySelector("ce-input");

      expect(new FormData(form).has("first")).toBe(false);
      expect(innerInput(input).disabled).toBe(true);
    });

    it("is disabled by a disabled fieldset", () => {
      const form = renderForm(`
        <fieldset>
          <ce-input name="first" value="Ada"></ce-input>
        </fieldset>
      `);
      const fieldset = form.querySelector("fieldset");
      const input = form.querySelector("ce-input");

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
      const input = form.querySelector("ce-input");
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
      const input = form.querySelector("ce-input");
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
      const input = form.querySelector("ce-input");
      const base = input.shadowRoot?.querySelector("[part='base']");
      const start = base?.querySelector("slot[name='start']");
      const end = base?.querySelector("slot[name='end']");

      expect(start?.assignedElements()).toEqual([form.querySelector("ce-icon")]);
      expect(end?.assignedElements()).toEqual([form.querySelector("span")]);
    });

    it("focus the input when clicked", async () => {
      const form = renderForm(`
        <ce-input name="query">
          <ce-icon slot="start" name="magnifying-glass"></ce-icon>
        </ce-input>
      `);
      const input = form.querySelector("ce-input");

      await userEvent.click(form.querySelector("ce-icon"));

      expect(input.shadowRoot?.activeElement).toBe(innerInput(input));
    });
  });

  describe("clear button", () => {
    /** @param {Element} host */
    function clearButton(host) {
      const button = host.shadowRoot?.querySelector("[part='clear-button']");

      if (!(button instanceof HTMLButtonElement)) {
        throw new Error("ce-input has no clear button");
      }

      return button;
    }

    it("is hidden without with-clear", () => {
      const form = renderForm(`<ce-input name="query" value="cats"></ce-input>`);

      expect(clearButton(form.querySelector("ce-input")).hidden).toBe(true);
    });

    it("is shown only while there's a value", async () => {
      const form = renderForm(`<ce-input name="query" with-clear></ce-input>`);
      const input = form.querySelector("ce-input");

      expect(clearButton(input).hidden).toBe(true);

      await userEvent.click(innerInput(input));
      await userEvent.keyboard("cats");

      expect(clearButton(input).hidden).toBe(false);
    });

    it("is hidden when disabled", () => {
      const form = renderForm(
        `<ce-input name="query" value="cats" with-clear disabled></ce-input>`,
      );

      expect(clearButton(form.querySelector("ce-input")).hidden).toBe(true);
    });

    it("clears the value, fires input and change, and focuses the input", async () => {
      const form = renderForm(`<ce-input name="query" value="cats" with-clear></ce-input>`);
      const input = form.querySelector("ce-input");

      /** @type {string[]} */
      const events = [];

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
});
