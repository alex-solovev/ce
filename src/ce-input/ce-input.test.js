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
});
