import { describe, expect, it, onTestFinished } from "vitest";
import { findScrollableAncestor } from "./transaction-bookmarklet";

describe(".findScrollableAncestor", () => {
  it("returns the nearest ancestor whose overflow-y scrolls real overflow", () => {
    const scroller = document.createElement("div");
    scroller.style.cssText = "height:50px;overflow-y:auto";
    const tall = document.createElement("div");
    tall.style.height = "500px";
    const start = document.createElement("span");
    tall.append(start);
    scroller.append(tall);
    document.body.append(scroller);
    onTestFinished(() => scroller.remove());

    expect(findScrollableAncestor(start)).toBe(scroller);
  });

  it("skips an ancestor with overflow-y but no real overflow", () => {
    const outer = document.createElement("div");
    outer.style.cssText = "height:50px;overflow-y:auto";
    const tall = document.createElement("div");
    tall.style.height = "500px";
    const fits = document.createElement("div");
    fits.style.cssText = "overflow-y:auto";
    const start = document.createElement("span");
    fits.append(start);
    tall.append(fits);
    outer.append(tall);
    document.body.append(outer);
    onTestFinished(() => outer.remove());

    expect(findScrollableAncestor(start)).toBe(outer);
  });

  it("returns null when no ancestor is scrollable", () => {
    const wrap = document.createElement("div");
    const start = document.createElement("span");
    wrap.append(start);
    document.body.append(wrap);
    onTestFinished(() => wrap.remove());

    expect(findScrollableAncestor(start)).toBeNull();
  });

  it("returns null when given no element", () => {
    expect(findScrollableAncestor(null)).toBeNull();
  });
});
