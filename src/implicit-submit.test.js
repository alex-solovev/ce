import { afterEach, describe, expect, it } from "vite-plus/test";
import { FormControl } from "./form-control.js";
import { submitImplicitly } from "./implicit-submit.js";

class TestControl extends FormControl {}

customElements.define("test-control", TestControl);

afterEach(() => {
  document.body.replaceChildren();
});

/**
 * Renders a form and records its submit events instead of navigating.
 * @param {string} html
 */
function renderForm(html) {
  const form = document.createElement("form");
  form.innerHTML = html;

  /** @type {SubmitEvent[]} */
  const submits = [];

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submits.push(event);
  });

  document.body.append(form);

  const control = form.querySelector("test-control");

  return { form, control, submits };
}

describe("submitImplicitly", () => {
  it("clicks the default button", () => {
    const { form, control, submits } = renderForm(`
      <test-control></test-control>
      <button type="submit" name="action" value="save">Save</button>
    `);
    const button = form.querySelector("button");

    submitImplicitly(control);

    expect(submits).toHaveLength(1);
    expect(submits[0].submitter).toBe(button);
  });

  it("uses the first submit button as the default", () => {
    const { form, control, submits } = renderForm(`
      <test-control></test-control>
      <button type="button">Not a submit button</button>
      <input type="submit" id="first" />
      <button type="submit" id="second">Second</button>
    `);
    const first = form.querySelector("#first");

    submitImplicitly(control);

    expect(submits).toHaveLength(1);
    expect(submits[0].submitter).toBe(first);
  });

  it("does nothing when the default button is disabled", () => {
    const { control, submits } = renderForm(`
      <test-control></test-control>
      <button type="submit" disabled>Disabled</button>
      <button type="submit">Enabled</button>
    `);

    submitImplicitly(control);

    expect(submits).toHaveLength(0);
  });

  it("submits the form when it has no submit button", () => {
    const { control, submits } = renderForm(`
      <test-control></test-control>
      <test-control></test-control>
    `);

    submitImplicitly(control);

    expect(submits).toHaveLength(1);
    expect(submits[0].submitter).toBe(null);
  });

  it("does nothing without a form", () => {
    const control = document.createElement("test-control");
    document.body.append(control);

    expect(() => submitImplicitly(control)).not.toThrow();
  });
});
