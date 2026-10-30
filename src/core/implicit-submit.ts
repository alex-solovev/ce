import type { FormControl } from "./form-control.ts";

/**
 * Implicit submission, as when pressing Enter in a native text input: clicks
 * the form's default button, or submits the form if it has none.
 * https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#implicit-submission
 *
 * Unlike native, a form without a default button submits even when it has
 * several fields.
 */
export function submitImplicitly(control: FormControl): void {
  const form = control.form;

  if (!form) {
    return;
  }

  // The default button is the first submit button in tree order.
  for (const element of form.elements) {
    if (!isSubmitButton(element)) {
      continue;
    }

    if (element.matches(":disabled")) {
      return;
    }

    element.click();
    return;
  }

  form.requestSubmit();
}

/** Native submit buttons, and our controls that expose a `type` of "submit". */
function isSubmitButton(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (!("type" in element)) {
    return false;
  }

  return element.type === "submit" || element.type === "image";
}
