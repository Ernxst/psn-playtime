/**
 * RAWG games-database client used to classify a title's genre when the keyword
 * rules in `enrich.ts` can't (i.e. they return "Other"). Server-side only and
 * gated behind the `RAWG_API_KEY` env var — with no key set, every lookup
 * resolves to `undefined` and callers fall back to the keyword result, so the
 * app and tests behave exactly as they did before.
 *
 * Lookups are cached in a caller-supplied `Map` for the duration of a single
 * `DashboardData` build (see `createRawgCache`). The cache is passed in rather
 * than module-global so a persistent backend (disk/KV) can be swapped in later
 * without touching call sites.
 */
import { z } from "zod";
import type { Genre } from "@/lib/psn/types";

const RAWG_ENDPOINT = "https://api.rawg.io/api/games";

/** RAWG genre name (lowercased) → our coarse `Genre` bucket. */
const GENRE_MAP: Record<string, Genre> = {
  shooter: "Shooter",
  rpg: "RPG",
  sports: "Sports",
  racing: "Racing",
  fighting: "Fighting",
  indie: "Indie/Casual",
  casual: "Indie/Casual",
  action: "Action-Adventure",
  adventure: "Action-Adventure",
  // Simulation / Strategy / Puzzle (and any other RAWG genre) are intentionally
  // unmapped: they resolve to `undefined` so the caller keeps its keyword result
  // (which is "Other" for these titles).
};

/** The slice of the RAWG `/games` search payload we rely on. */
const rawgResponseSchema = z.object({
  results: z
    .array(z.object({ genres: z.array(z.object({ name: z.string() })).optional() }))
    .optional(),
});

/**
 * Map a RAWG game's ordered genre names to a single `Genre`, taking the first
 * one we recognise (RAWG returns genres roughly by relevance). Returns
 * `undefined` when none map, signalling the caller to keep its fallback.
 */
export function mapRawgGenres(names: string[]): Genre | undefined {
  for (const name of names) {
    const mapped = GENRE_MAP[name.toLowerCase()];
    if (mapped) return mapped;
  }
  return undefined;
}

/**
 * Normalise a PSN title into a search query: strip trademark glyphs, drop
 * parentheticals (platform tags), remove edition/bundle words and punctuation
 * so the fuzzy RAWG search matches the canonical game name.
 */
function normalizeForSearch(name: string): string {
  return name
    .replace(/[™®©]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(
      /\b(deluxe|standard|ultimate|gold|complete|definitive|legendary|game of the year|goty|remastered|remake|bundle|collection|edition|director'?s cut|anniversary)\b/gi,
      " "
    )
    .replace(/[:\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A build-scoped lookup cache, keyed by normalized query. */
export type RawgCache = Map<string, Genre | undefined>;

export function createRawgCache(): RawgCache {
  return new Map();
}

/** Run a single RAWG search, returning the mapped genre or `undefined`. */
async function searchRawgGenre(query: string, apiKey: string): Promise<Genre | undefined> {
  const url = `${RAWG_ENDPOINT}?search=${encodeURIComponent(query)}&key=${apiKey}&page_size=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const parsed = rawgResponseSchema.safeParse(await res.json());
    if (!parsed.success) return undefined;
    const genres = parsed.data.results?.[0]?.genres?.map((g) => g.name) ?? [];
    return mapRawgGenres(genres);
  } catch {
    return undefined;
  }
}

/**
 * Look up a title's genre via RAWG. Resolves to `undefined` when no key is set,
 * the search has no usable match, or the request errors — in every such case
 * the caller falls back to its keyword result.
 */
export async function lookupRawgGenre(name: string, cache: RawgCache): Promise<Genre | undefined> {
  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) return undefined;

  const query = normalizeForSearch(name);
  if (!query) return undefined;

  const key = query.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  const result = await searchRawgGenre(query, apiKey);
  cache.set(key, result);
  return result;
}
