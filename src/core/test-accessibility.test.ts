import { afterEach, describe, expect, it } from "vite-plus/test";
import { accessibleNodeDetails, withRole } from "./test-accessibility.ts";

afterEach(() => {
  document.body.replaceChildren();
});

describe("accessibleNodeDetails", () => {
  it("reads a combobox's value, state and relations", async () => {
    document.body.innerHTML = `
      <input role="combobox" aria-label="Fruit" value="Ban" aria-expanded="true"
        aria-autocomplete="list" aria-haspopup="listbox" aria-controls="list"
        aria-activedescendant="banana" />
      <div id="list" role="listbox" aria-label="Fruits" aria-multiselectable="true">
        <div role="option" id="apple" aria-selected="false">Apple</div>
        <div role="option" id="banana" aria-selected="true">Banana</div>
        <div role="option" aria-disabled="true" aria-selected="false">Cherry</div>
      </div>
    `;
    document.querySelector("input")?.focus();

    const nodes = await accessibleNodeDetails();
    const [combobox] = withRole(nodes, "combobox");
    const [listbox] = withRole(nodes, "listbox");
    const options: [string, boolean, boolean][] = [];

    for (const node of withRole(nodes, "option")) {
      options.push([node.name, node.selected, node.disabled]);
    }

    expect(combobox).toMatchObject({
      name: "Fruit",
      value: "Ban",
      focused: true,
      expanded: true,
      autocomplete: "list",
      hasPopup: "listbox",
      activeDescendant: "option:Banana",
      controls: ["listbox:Fruits"],
    });
    expect(listbox?.multiselectable).toBe(true);
    expect(options).toEqual([
      ["Apple", false, false],
      ["Banana", true, false],
      ["Cherry", false, true],
    ]);
  });

  it("uses empty defaults for nodes without those properties", async () => {
    document.body.innerHTML = `<button type="button">Go</button>`;

    const [button] = withRole(await accessibleNodeDetails(), "button");

    expect(button).toEqual({
      role: "button",
      name: "Go",
      description: "",
      value: "",
      selected: false,
      disabled: false,
      focused: false,
      expanded: null,
      multiselectable: false,
      autocomplete: "",
      hasPopup: "",
      live: "",
      activeDescendant: null,
      controls: [],
    });
  });

  // CDP lists nodes level by level: a deeper node would come after a
  // shallower one that follows it on the page.
  it("lists nodes in page order", async () => {
    document.body.innerHTML = `
      <div><p><button type="button">First</button></p></div>
      <button type="button">Second</button>
    `;

    const names: string[] = [];

    for (const node of withRole(await accessibleNodeDetails(), "button")) {
      names.push(node.name);
    }

    expect(names).toEqual(["First", "Second"]);
  });

  it("reads collapsed and live region politeness", async () => {
    document.body.innerHTML = `
      <button type="button" aria-expanded="false">Menu</button>
      <div role="status" aria-label="Status">3 results</div>
    `;

    const nodes = await accessibleNodeDetails();

    expect(withRole(nodes, "button")[0]?.expanded).toBe(false);
    expect(withRole(nodes, "status")[0]?.live).toBe("polite");
  });
});
