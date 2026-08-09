import { describe, expect, it } from "vitest";
import { demoDashboard } from "@/domain/mock";
import { mergeRawgEnrichment } from "./state";

describe(".mergeRawgEnrichment", () => {
  it("merges RAWG fields without changing the PlayStation artwork source", () => {
    const data = {
      ...demoDashboard,
      isDemo: false,
      games: [
        {
          titleId: "imported-title",
          name: "Imported game",
          platform: "PS5" as const,
          hours: 1,
          playCount: 1,
          category: "ps5_native_game",
          genre: "Other" as const,
          isApp: false,
          imageUrl: "https://image.api.playstation.com/imported.jpg",
        },
      ],
    };

    const enriched = mergeRawgEnrichment(
      data,
      [{ titleId: "imported-title", genre: "RPG", typicalPlaytime: 20 }],
      [{ titleId: "imported-title", franchise: "Imported series" }]
    );

    expect(enriched.games[0]).toMatchObject({
      genre: "RPG",
      typicalPlaytime: 20,
      franchise: "Imported series",
      imageUrl: "https://image.api.playstation.com/imported.jpg",
    });
  });
});
