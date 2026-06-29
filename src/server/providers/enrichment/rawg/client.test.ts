import { describe, expect, it } from "vitest";
import type { Genre } from "@/lib/psn/contract.schema";
import { deriveFranchise, mapRawgGenres } from "@/server/providers/enrichment/rawg/client";

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
