import { afterEach, describe, expect, it } from "vite-plus/test";
import "./hello-world.js";

afterEach(() => {
  document.body.replaceChildren();
});

/**
 * @param {Element} host
 * @returns {string | null | undefined}
 */
function greeting(host) {
  return host.shadowRoot?.querySelector("span")?.textContent;
}

describe("hello-world", () => {
  it("greets the world by default", () => {
    const element = document.createElement("hello-world");
    document.body.append(element);

    expect(greeting(element)).toBe("Hello, World!");
  });

  it("greets the name attribute and follows changes", () => {
    document.body.innerHTML = `<hello-world name="Ada"></hello-world>`;
    const element = document.querySelector("hello-world");

    expect(greeting(element)).toBe("Hello, Ada!");

    element.name = "Grace";

    expect(element.getAttribute("name")).toBe("Grace");
    expect(greeting(element)).toBe("Hello, Grace!");
  });
});
