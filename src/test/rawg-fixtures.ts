export interface RawgGameFixture {
  readonly id?: number;
  readonly name?: string;
  readonly genres?: ReadonlyArray<{ readonly name: string }>;
  readonly playtime?: number;
}

export const rawgGame = (
  overrides: Omit<RawgGameFixture, "genres"> & { genres?: ReadonlyArray<string> } = {}
): RawgGameFixture => ({
  id: 1,
  name: "RAWG test game",
  ...overrides,
  genres: overrides.genres?.map((name) => ({ name })) ?? [],
});

export const rawgSearch = (results: ReadonlyArray<RawgGameFixture> = []) => ({ results });

export const rawgSeries = (names: ReadonlyArray<string> = []) => ({
  results: names.map((name) => ({ name })),
});
