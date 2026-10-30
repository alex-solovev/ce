import { defaultIcons } from "./icon-library-default.js";

/**
 * Library name to its icons (icon name to SVG markup).
 * @type {Map<string, Record<string, string>>}
 */
const libraries = new Map([["default", defaultIcons]]);

/**
 * Called with a library's name whenever it's registered.
 * @type {Set<(library: string) => void>}
 */
const listeners = new Set();

/**
 * Adds an icon library, or replaces one with the same name. Icons already
 * on the page that use it are redrawn.
 *
 * SVG markup is inserted as live DOM, so only register trusted sources.
 *
 * @param {string} name
 * @param {Record<string, string>} icons Icon name to SVG markup.
 */
export function registerIconLibrary(name, icons) {
  libraries.set(name, icons);

  for (const listener of listeners) {
    listener(name);
  }
}

/**
 * @param {string} library
 * @param {string} name
 * @returns {string | null} SVG markup, or null if there's no such icon.
 */
export function getIcon(library, name) {
  const icons = libraries.get(library);

  if (!icons) {
    return null;
  }

  // Own properties only, so names like "constructor" don't resolve.
  if (!Object.hasOwn(icons, name)) {
    return null;
  }

  return icons[name];
}

/** @param {(library: string) => void} listener */
export function watchIconLibraries(listener) {
  listeners.add(listener);
}

/** @param {(library: string) => void} listener */
export function unwatchIconLibraries(listener) {
  listeners.delete(listener);
}
