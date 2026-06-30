/**
 * Pure RAWG mapping helpers used by the RAWG `TitleEnrichment` provider: genre
 * mapping, query normalization, playtime normalization, and franchise
 * derivation.
 *
 * The provider owns all networking, the `RAWG_API_KEY` gate, response decoding,
 * and the lookup caches. This module is deliberately side-effect-free so the
 * mapping/derivation rules stay trivially testable.
 */
import type { Genre } from "../../account/snapshot";

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

/**
 * Map a RAWG game's ordered genre names to a single `Genre`, taking the first
 * one we recognise (RAWG returns genres roughly by relevance). Returns
 * `undefined` when none map, signalling the caller to keep its fallback.
 */
export function mapRawgGenres(names: string[]): Genre | undefined {
  for (const name of names) {
    const mapped = GENRE_MAP[name.toLowerCase()];
    if (mapped !== undefined) return mapped;
  }
  return undefined;
}

/**
 * Normalise a PSN title into a search query: strip trademark glyphs, drop
 * parentheticals (platform tags), remove edition/bundle words and punctuation
 * so the fuzzy RAWG search matches the canonical game name.
 */
export function normalizeForSearch(name: string): string {
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

/** Strip trademark glyphs and collapse whitespace for franchise comparison. */
function cleanName(name: string): string {
  return name
    .replace(/[™®©]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Derive a franchise/series label as the longest leading run of words shared by
 * every supplied game name (the matched game plus its RAWG series). Requires at
 * least two names so a lone title isn't mistaken for a franchise, and returns
 * `undefined` when the names share no common leading word — collapsing variants
 * in the process ("God of War", "God of War Ragnarök" → "God of War").
 */
function commonPrefixWords(wordLists: string[][]): string[] {
  const [first, ...rest] = wordLists;
  const prefix: string[] = [];
  for (const word of first!) {
    const index = prefix.length;
    if (!rest.every((words) => words[index]?.toLowerCase() === word.toLowerCase())) break;
    prefix.push(word);
  }
  return prefix;
}

export function deriveFranchise(names: string[]): string | undefined {
  const wordLists = names.flatMap((name) => {
    const cleaned = cleanName(name);
    return cleaned.length > 0 ? [cleaned.split(" ")] : [];
  });
  if (wordLists.length < 2) return undefined;

  const franchise = commonPrefixWords(wordLists)
    .join(" ")
    .replace(/[:\-–—]+$/, "")
    .trim();
  return franchise.length > 0 ? franchise : undefined;
}

/** Normalise RAWG's `playtime`: treat 0/absent as "no data" (`undefined`). */
export function normalizePlaytime(playtime: number | undefined): number | undefined {
  return playtime !== undefined && playtime > 0 ? playtime : undefined;
}
