import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { rawgFranchisesEffect, rawgGenresEffect } from "@/server/api/enrichment.effect";
import { TitleEnrichmentLayer } from "@/server/providers/enrichment/rawg/provider.effect";
import { server } from "@/test/msw";
import { RAWG_GAMES_URL, RAWG_SERIES_URL } from "@/test/msw-handlers";
import { rawgGame, rawgSearch, rawgSeries } from "@/test/rawg-fixtures";

const RAWG = Layer.provide(
  TitleEnrichmentLayer,
  ConfigProvider.layer(ConfigProvider.fromUnknown({ RAWG_API_KEY: "test-key" }))
);

type RawgTitle = { titleId: string; name: string };

const runGenres = (titles: RawgTitle[]) =>
  Effect.runPromise(rawgGenresEffect(titles).pipe(Effect.provide(RAWG)));

const runFranchises = (titles: RawgTitle[]) =>
  Effect.runPromise(rawgFranchisesEffect(titles).pipe(Effect.provide(RAWG)));

describe(".rawgGenresEffect", () => {
  it("returns RAWG metadata and drops titles with absent metadata", async () => {
    const search = vi.fn(({ request }: { request: Request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.get("search") === "Halo"
          ? rawgSearch([rawgGame({ genres: ["Shooter"], playtime: 12 })])
          : rawgSearch()
      )
    );
    server.use(http.get(RAWG_GAMES_URL, search));

    const result = await runGenres([
      { titleId: "halo", name: "Halo" },
      { titleId: "mystery", name: "Mystery Game" },
    ]);

    expect(result).toStrictEqual([{ titleId: "halo", genre: "Shooter", typicalPlaytime: 12 }]);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      label: "a genre with no typical playtime",
      game: rawgGame({ genres: ["RPG"] }),
      enrichment: { genre: "RPG" },
    },
    {
      label: "a typical playtime with no genre",
      game: rawgGame({ playtime: 20 }),
      enrichment: { typicalPlaytime: 20 },
    },
  ])("includes $label", async ({ game, enrichment }) => {
    server.use(http.get(RAWG_GAMES_URL, () => HttpResponse.json(rawgSearch([game]))));

    await expect(runGenres([{ titleId: "t1", name: "Game" }])).resolves.toStrictEqual([
      { titleId: "t1", ...enrichment },
    ]);
  });

  it("looks a duplicated title name up once and applies its metadata to every title", async () => {
    const search = vi.fn(() => HttpResponse.json(rawgSearch([rawgGame({ genres: ["Racing"] })])));
    server.use(http.get(RAWG_GAMES_URL, search));

    const result = await runGenres([
      { titleId: "gt-ps4", name: "Gran Turismo" },
      { titleId: "gt-ps5", name: "Gran Turismo" },
    ]);

    expect(result).toStrictEqual([
      { titleId: "gt-ps4", genre: "Racing" },
      { titleId: "gt-ps5", genre: "Racing" },
    ]);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: "rate-limits", status: 429 },
    { label: "is unavailable", status: 503 },
  ])("degrades to blank enrichment when RAWG $label", async ({ status }) => {
    server.use(http.get(RAWG_GAMES_URL, () => new HttpResponse(null, { status })));

    await expect(runGenres([{ titleId: "t1", name: "Game" }])).resolves.toStrictEqual([]);
  });
});

describe(".rawgFranchisesEffect", () => {
  it("returns a derived RAWG franchise and drops titles with no match", async () => {
    const search = vi.fn(({ request }: { request: Request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.get("search") === "Forza Horizon 5"
          ? rawgSearch([rawgGame({ id: 42, name: "Forza Horizon 5" })])
          : rawgSearch()
      )
    );
    const series = vi.fn(() =>
      HttpResponse.json(rawgSeries(["Forza Horizon 4", "Forza Motorsport 7"]))
    );
    server.use(http.get(RAWG_GAMES_URL, search), http.get(RAWG_SERIES_URL, series));

    const result = await runFranchises([
      { titleId: "forza", name: "Forza Horizon 5" },
      { titleId: "mystery", name: "Mystery Game" },
    ]);

    expect(result).toStrictEqual([{ titleId: "forza", franchise: "Forza" }]);
    expect(search).toHaveBeenCalledTimes(2);
    expect(series).toHaveBeenCalledTimes(1);
  });

  it("looks a duplicated title name up once and applies its franchise to every title", async () => {
    const search = vi.fn(() =>
      HttpResponse.json(rawgSearch([rawgGame({ id: 42, name: "Gran Turismo 7" })]))
    );
    const series = vi.fn(() => HttpResponse.json(rawgSeries(["Gran Turismo Sport"])));
    server.use(http.get(RAWG_GAMES_URL, search), http.get(RAWG_SERIES_URL, series));

    const result = await runFranchises([
      { titleId: "gt-ps4", name: "Gran Turismo 7" },
      { titleId: "gt-ps5", name: "Gran Turismo 7" },
    ]);

    expect(result).toStrictEqual([
      { titleId: "gt-ps4", franchise: "Gran Turismo" },
      { titleId: "gt-ps5", franchise: "Gran Turismo" },
    ]);
    expect(search).toHaveBeenCalledTimes(1);
    expect(series).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: "rate-limits", status: 429 },
    { label: "is unavailable", status: 503 },
  ])("degrades to blank enrichment when RAWG $label", async ({ status }) => {
    server.use(http.get(RAWG_GAMES_URL, () => new HttpResponse(null, { status })));

    await expect(runFranchises([{ titleId: "t1", name: "Game" }])).resolves.toStrictEqual([]);
  });
});
