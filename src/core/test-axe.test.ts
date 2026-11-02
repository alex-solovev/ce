import { afterEach, describe, expect, it } from "vite-plus/test";
import { axeViolations } from "./test-axe.ts";

afterEach(() => {
  document.body.replaceChildren();
});

describe("axeViolations", () => {
  it("is empty for accessible markup", async () => {
    document.body.innerHTML = `<div><button type="button">Go</button></div>`;

    expect(await axeViolations(document.body)).toEqual([]);
  });

  it("reports violations by rule and selector", async () => {
    document.body.innerHTML = `<div><button type="button" id="empty"></button></div>`;

    expect(await axeViolations(document.body)).toEqual(["button-name: #empty"]);
  });

  it("checks inside shadow roots", async () => {
    const host = document.createElement("div");
    host.id = "host";
    host.attachShadow({ mode: "open" }).innerHTML = `<button type="button" id="empty"></button>`;
    document.body.append(host);

    expect(await axeViolations(document.body)).toEqual(["button-name: #host >>> #empty"]);
  });

  it("sees roles and states that elements set through private ElementInternals", async () => {
    class PrivateOption extends HTMLElement {
      #internals = this.attachInternals();

      constructor() {
        super();
        this.#internals.role = "option";
        this.#internals.ariaSelected = "false";
      }
    }

    customElements.define("private-option", PrivateOption);
    document.body.innerHTML = `
      <div role="listbox" aria-label="Fruit"><private-option>Apple</private-option></div>
    `;

    // Without the role, axe would report the listbox as missing its options.
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it("skips the rules a caller ignores", async () => {
    document.body.innerHTML = `<div><button type="button" id="empty"></button></div>`;

    expect(await axeViolations(document.body, ["button-name"])).toEqual([]);
  });

  it("skips page-level rules", async () => {
    document.body.innerHTML = `<p>Text outside any landmark</p>`;

    expect(await axeViolations(document.body)).toEqual([]);
  });
});
