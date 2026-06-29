/**
 * Minimal in-memory Web Storage API stub for node tests of the localStorage-backed
 * stores. The node test project has no DOM, so the stores' `window`/`localStorage`
 * branches are exercised by stubbing a real `Storage`-shaped object (via
 * `vi.stubGlobal("window", ...)`). This stands in for the browser's own storage —
 * it is not a behavioural mock; it implements the same read/write semantics.
 */

/** A `localStorage`-shaped, Map-backed store implementing the surface the stores use. */
class MemoryStorage {
  readonly #items = new Map<string, string>();

  get length(): number {
    return this.#items.size;
  }

  getItem(key: string): string | null {
    return this.#items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#items.set(key, value);
  }

  removeItem(key: string): void {
    this.#items.delete(key);
  }

  key(index: number): string | null {
    return [...this.#items.keys()][index] ?? null;
  }

  clear(): void {
    this.#items.clear();
  }
}

/**
 * Build a fresh `window`-shaped stub for a single test — an `EventTarget` (for the
 * stores' same-tab change events) carrying an isolated in-memory `localStorage`.
 */
export function createWindowStub(): EventTarget & { localStorage: MemoryStorage } {
  return Object.assign(new EventTarget(), { localStorage: new MemoryStorage() });
}
