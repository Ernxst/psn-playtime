import { afterEach, describe, expect, it, vi } from "vitest";
import type { Genre } from "@/lib/psn/types";
import {
  createRawgCache,
  createRawgFranchiseCache,
  deriveFranchise,
  lookupRawgFranchise,
  lookupRawgGenre,
  mapRawgGenres,
} from "@/server/rawg";

function rawgResponse(genres: string[]): Response {
  return new Response(JSON.stringify({ results: [{ genres: genres.map((name) => ({ name })) }] }), {
    status: 200,
  });
}

function searchResponse(id: number, name: string): Response {
  return new Response(JSON.stringify({ results: [{ id, name }] }), { status: 200 });
}

function seriesResponse(names: string[]): Response {
  return new Response(JSON.stringify({ results: names.map((name) => ({ name })) }), {
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

  it("falls back to undefined when the response payload fails schema validation", async () => {
    process.env.RAWG_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: "not-an-array" }), { status: 200 })
    );

    await expect(lookupRawgGenre("Some Game", createRawgCache())).resolves.toBeUndefined();
  });

  it("returns undefined for a result with no genres array", async () => {
    process.env.RAWG_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [{}] }), { status: 200 })
    );

    await expect(lookupRawgGenre("Some Game", createRawgCache())).resolves.toBeUndefined();
  });

  it("skips the network when the name normalizes to an empty query", async () => {
    process.env.RAWG_API_KEY = "test-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(lookupRawgGenre("™®©", createRawgCache())).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe(".deriveFranchise", () => {
  it.each<[string[], string]>([
    [["Forza Horizon 5", "Forza Horizon 4", "Forza Motorsport 7"], "Forza"],
    [["God of War", "God of War Ragnarök"], "God of War"],
    [["The Witcher 3", "The Witcher 2"], "The Witcher"],
    [["Dragon Age: Origins", "Dragon Age: Inquisition"], "Dragon Age"],
  ])("derives the shared leading words of %j as %s", (names, expected) => {
    expect(deriveFranchise(names)).toBe(expected);
  });

  it("does not fabricate a one-word franchise from distinct same-letter series", () => {
    expect(deriveFranchise(["Dragon Age: Origins", "Dragon's Dogma"])).toBeUndefined();
  });

  it("compares words case-insensitively while preserving the first name's casing", () => {
    expect(deriveFranchise(["Mass Effect", "MASS EFFECT 2"])).toBe("Mass Effect");
  });

  it("strips trademark glyphs before comparing", () => {
    expect(deriveFranchise(["Gran Turismo®", "Gran Turismo 7"])).toBe("Gran Turismo");
  });

  it("trims a trailing separator left by the shared prefix", () => {
    expect(deriveFranchise(["Uncharted: Drake's Fortune", "Uncharted: Among Thieves"])).toBe(
      "Uncharted"
    );
  });

  it("returns undefined for a single name", () => {
    expect(deriveFranchise(["No Man's Sky"])).toBeUndefined();
  });

  it("returns undefined when the names share no leading word", () => {
    expect(deriveFranchise(["Bloodborne", "Elden Ring"])).toBeUndefined();
  });

  it("ignores blank names when counting how many remain", () => {
    expect(deriveFranchise(["Tomb Raider", "   "])).toBeUndefined();
  });
});

describe(".lookupRawgFranchise", () => {
  afterEach(() => {
    delete process.env.RAWG_API_KEY;
    vi.restoreAllMocks();
  });

  it("returns undefined and skips the network when no key is set", async () => {
    delete process.env.RAWG_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      lookupRawgFranchise("Celeste", createRawgFranchiseCache())
    ).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("derives a franchise from the matched game and its series", async () => {
    process.env.RAWG_API_KEY = "test-key";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(searchResponse(42, "Forza Horizon 5"))
      .mockResolvedValueOnce(seriesResponse(["Forza Horizon 4", "Forza Motorsport 7"]));

    await expect(lookupRawgFranchise("Forza Horizon 5", createRawgFranchiseCache())).resolves.toBe(
      "Forza"
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenNthCalledWith(1, expect.stringContaining("search=Forza"));
    expect(fetchSpy).toHaveBeenNthCalledWith(2, expect.stringContaining("/42/game-series"));
  });

  it("caches a result so a repeated lookup hits the network once", async () => {
    process.env.RAWG_API_KEY = "test-key";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(searchResponse(1, "God of War Ragnarök"))
      .mockResolvedValueOnce(seriesResponse(["God of War"]));
    const cache = createRawgFranchiseCache();

    const first = await lookupRawgFranchise("God of War Ragnarök", cache);
    const second = await lookupRawgFranchise("God of War Ragnarök", cache);

    expect(first).toBe("God of War");
    expect(second).toBe("God of War");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("returns undefined and skips the series request when the search has no match", async () => {
    process.env.RAWG_API_KEY = "test-key";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));

    await expect(
      lookupRawgFranchise("Totally Unknown Title", createRawgFranchiseCache())
    ).resolves.toBeUndefined();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns undefined when the matched game belongs to no series", async () => {
    process.env.RAWG_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(searchResponse(7, "Stray"))
      .mockResolvedValueOnce(seriesResponse([]));

    await expect(lookupRawgFranchise("Stray", createRawgFranchiseCache())).resolves.toBeUndefined();
  });

  it("returns undefined when the series request is non-ok", async () => {
    process.env.RAWG_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(searchResponse(7, "Stray"))
      .mockResolvedValueOnce(new Response("nope", { status: 503 }));

    await expect(lookupRawgFranchise("Stray", createRawgFranchiseCache())).resolves.toBeUndefined();
  });

  it("falls back to undefined on a non-ok search response", async () => {
    process.env.RAWG_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 503 }));

    await expect(
      lookupRawgFranchise("Some Game", createRawgFranchiseCache())
    ).resolves.toBeUndefined();
  });

  it("falls back to undefined when the search request throws", async () => {
    process.env.RAWG_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(
      lookupRawgFranchise("Some Game", createRawgFranchiseCache())
    ).resolves.toBeUndefined();
  });

  it("falls back to undefined when the search payload fails schema validation", async () => {
    process.env.RAWG_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [{ name: "no id here" }] }), { status: 200 })
    );

    await expect(
      lookupRawgFranchise("Some Game", createRawgFranchiseCache())
    ).resolves.toBeUndefined();
  });

  it("skips the network when the name normalizes to an empty query", async () => {
    process.env.RAWG_API_KEY = "test-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(lookupRawgFranchise("™®©", createRawgFranchiseCache())).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
