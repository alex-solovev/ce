import type { FormControl } from "./form-control.js";

/**
 * Clicks the control's form default button, or submits the form if it has
 * none. Does nothing if the default button is disabled or there's no form.
 */
export declare function submitImplicitly(control: FormControl): void;
