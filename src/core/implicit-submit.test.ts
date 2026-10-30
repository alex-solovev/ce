import { afterEach, describe, expect, it } from "vite-plus/test";
import { FormControl } from "./form-control.ts";
import { submitImplicitly } from "./implicit-submit.ts";
import { query } from "./test-dom.ts";

class TestControl extends FormControl {}

customElements.define("test-control", TestControl);

afterEach(() => {
  document.body.replaceChildren();
});

/** Renders a form and records its submit events instead of navigating. */
function renderForm(html: string) {
  const form = document.createElement("form");
  form.innerHTML = html;

  const submits: SubmitEvent[] = [];

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submits.push(event);
  });

  document.body.append(form);

  const control = query<TestControl>(form, "test-control");

  return { form, control, submits };
}

describe("submitImplicitly", () => {
  it("clicks the default button", () => {
    const { form, control, submits } = renderForm(`
      <test-control></test-control>
      <button type="submit" name="action" value="save">Save</button>
    `);
    const button = query(form, "button");

    submitImplicitly(control);

    expect(submits).toHaveLength(1);
    expect(submits[0]?.submitter).toBe(button);
  });

  it("uses the first submit button as the default", () => {
    const { form, control, submits } = renderForm(`
      <test-control></test-control>
      <button type="button">Not a submit button</button>
      <input type="submit" id="first" />
      <button type="submit" id="second">Second</button>
    `);
    const first = query(form, "#first");

    submitImplicitly(control);

    expect(submits).toHaveLength(1);
    expect(submits[0]?.submitter).toBe(first);
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
    expect(submits[0]?.submitter).toBe(null);
  });

  it("does nothing without a form", () => {
    const control = new TestControl();
    document.body.append(control);

    expect(() => submitImplicitly(control)).not.toThrow();
  });
});
