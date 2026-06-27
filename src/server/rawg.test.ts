import { afterEach, describe, expect, it, vi } from "vitest";
import type { Genre } from "@/lib/psn/types";
import { createRawgCache, lookupRawgGenre, mapRawgGenres } from "@/server/rawg";

function rawgResponse(genres: string[]): Response {
  return new Response(JSON.stringify({ results: [{ genres: genres.map((name) => ({ name })) }] }), {
    status: 200,
  });
}

describe(".mapRawgGenres", () => {
  it.each<[string[], Genre]>([
    [["Shooter"], "Shooter"],
    [["RPG"], "RPG"],
    [["Sports"], "Sports"],
    [["Racing"], "Racing"],
    [["Fighting"], "Fighting"],
    [["Indie"], "Indie/Casual"],
    [["Casual"], "Indie/Casual"],
    [["Action"], "Action-Adventure"],
    [["Adventure"], "Action-Adventure"],
  ])("maps RAWG genres %j to %s", (names, expected) => {
    expect(mapRawgGenres(names)).toBe(expected);
  });

  it.each<[string[]]>([[["Simulation"]], [["Strategy"]], [["Puzzle"]], [["Platformer"]], [[]]])(
    "leaves unmapped genres %j undefined",
    (names) => {
      expect(mapRawgGenres(names)).toBeUndefined();
    }
  );

  it("takes the first recognised genre in order", () => {
    expect(mapRawgGenres(["Action", "Shooter"])).toBe("Action-Adventure");
  });

  it("skips unmapped genres to reach the first recognised one", () => {
    expect(mapRawgGenres(["Simulation", "RPG"])).toBe("RPG");
  });

  it("matches genre names case-insensitively", () => {
    expect(mapRawgGenres(["sHoOtEr"])).toBe("Shooter");
  });
});

describe(".lookupRawgGenre", () => {
  afterEach(() => {
    delete process.env.RAWG_API_KEY;
    vi.restoreAllMocks();
  });

  it("returns undefined and skips the network when no key is set", async () => {
    delete process.env.RAWG_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(lookupRawgGenre("Celeste", createRawgCache())).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps the first search result's genres to a Genre", async () => {
    process.env.RAWG_API_KEY = "test-key";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(rawgResponse(["Action", "Shooter"]));

    await expect(lookupRawgGenre("Returnal", createRawgCache())).resolves.toBe("Action-Adventure");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("search=Returnal"));
  });

  it("caches a result so a repeated lookup hits the network once", async () => {
    process.env.RAWG_API_KEY = "test-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(rawgResponse(["Racing"]));
    const cache = createRawgCache();

    const first = await lookupRawgGenre("Gran Turismo 7", cache);
    const second = await lookupRawgGenre("Gran Turismo 7", cache);

    expect(first).toBe("Racing");
    expect(second).toBe("Racing");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns undefined when the search yields no mappable genre", async () => {
    process.env.RAWG_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(rawgResponse(["Simulation"]));

    await expect(
      lookupRawgGenre("Powerwash Simulator", createRawgCache())
    ).resolves.toBeUndefined();
  });

  it("falls back to undefined on a non-ok response", async () => {
    process.env.RAWG_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 503 }));

    await expect(lookupRawgGenre("Some Game", createRawgCache())).resolves.toBeUndefined();
  });

  it("falls back to undefined when the request throws", async () => {
    process.env.RAWG_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(lookupRawgGenre("Some Game", createRawgCache())).resolves.toBeUndefined();
  });
});
