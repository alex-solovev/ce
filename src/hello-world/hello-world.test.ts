import { afterEach, describe, expect, it } from "vite-plus/test";
import { query } from "../core/test-dom.ts";
import "./hello-world.ts";

afterEach(() => {
  document.body.replaceChildren();
});

function greeting(host: Element): string | null | undefined {
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
    const element = query(document, "hello-world");

    expect(greeting(element)).toBe("Hello, Ada!");

    element.name = "Grace";

    expect(element.getAttribute("name")).toBe("Grace");
    expect(greeting(element)).toBe("Hello, Grace!");
  });
});
