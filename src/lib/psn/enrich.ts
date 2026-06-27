/**
 * Title enrichment: derive a coarse genre, a franchise/series name, and whether
 * a title is a non-game app (streaming/music/browser). Keyword-driven to mirror
 * the taxonomy baked into the demo dataset (`mock.ts`).
 */
import type { Genre, Platform } from "./types";

interface FranchiseRule {
  test: RegExp;
  genre: Genre;
  franchise: string;
}

/** Franchise rules, ordered most-specific first (e.g. Forza before Horizon). */
const FRANCHISE_RULES: FranchiseRule[] = [
  { test: /call of duty/i, genre: "Shooter", franchise: "Call of Duty" },
  { test: /\bforza\b/i, genre: "Racing", franchise: "Forza" },
  {
    test: /ea sports.*\bfc\b|\bfifa\b|\bfc\s?2[0-9]\b/i,
    genre: "Sports",
    franchise: "FIFA / EA FC",
  },
  { test: /nba\s?2k/i, genre: "Sports", franchise: "NBA 2K" },
  { test: /grand theft auto|\bgta\b/i, genre: "Open World", franchise: "Grand Theft Auto" },
  { test: /battlefield/i, genre: "Shooter", franchise: "Battlefield" },
  {
    test: /tom clancy|rainbow six|the division|ghost recon|splinter cell/i,
    genre: "Shooter",
    franchise: "Tom Clancy",
  },
  {
    test: /horizon (forbidden west|zero dawn|call of the mountain)/i,
    genre: "Open World",
    franchise: "Horizon",
  },
  { test: /tomb raider/i, genre: "Action-Adventure", franchise: "Tomb Raider" },
  { test: /star wars/i, genre: "Action-Adventure", franchise: "Star Wars" },
  { test: /mass effect/i, genre: "RPG", franchise: "Mass Effect" },
  { test: /cyberpunk/i, genre: "RPG", franchise: "Cyberpunk" },
  { test: /witcher/i, genre: "RPG", franchise: "The Witcher" },
  { test: /minecraft/i, genre: "Survival/Craft", franchise: "Minecraft" },
  { test: /satisfactory/i, genre: "Survival/Craft", franchise: "Satisfactory" },
  { test: /no man'?s sky/i, genre: "Survival/Craft", franchise: "No Man's Sky" },
  { test: /subnautica/i, genre: "Survival/Craft", franchise: "Subnautica" },
  { test: /need for speed/i, genre: "Racing", franchise: "Need for Speed" },
  { test: /\bf1\b|formula 1/i, genre: "Racing", franchise: "F1" },
  { test: /god of war/i, genre: "Action-Adventure", franchise: "God of War" },
  { test: /warhammer 40|space marine/i, genre: "Shooter", franchise: "Warhammer 40K" },
  { test: /gears (of war|tactics)|gears 5/i, genre: "Shooter", franchise: "Gears of War" },
  { test: /fortnite/i, genre: "Shooter", franchise: "Fortnite" },
  { test: /fall guys/i, genre: "Indie/Casual", franchise: "Fall Guys" },
];

/** Genre-only keywords for non-franchise titles. */
const GENRE_RULES: Array<{ test: RegExp; genre: Genre }> = [
  { test: /crysis/i, genre: "Shooter" },
  { test: /destiny/i, genre: "Shooter" },
  { test: /helldivers/i, genre: "Shooter" },
  { test: /\banthem\b/i, genre: "Shooter" },
  { test: /bioshock/i, genre: "Shooter" },
  { test: /metal gear/i, genre: "Shooter" },
  { test: /\buno\b|monopoly|brawlhalla/i, genre: "Indie/Casual" },
];

/** Streaming / music / browser apps that should be excluded from play stats. */
const APP_RULE =
  /youtube|netflix|spotify|disney\s?\+|disney plus|prime video|amazon prime|bbc iplayer|apple tv|apple music|\btwitch\b|\bplex\b|\bnow\b|channel\s?4|sky go|\bhulu\b|crunchyroll|\bhbo\b|^max$|\bdazn\b|\btidal\b|deezer|peacock|paramount\s?\+|funimation|web browser|internet browser/i;

function isAppTitle(name: string, category?: string): boolean {
  if (category && /media_app|_app\b/i.test(category)) return true;
  return APP_RULE.test(name);
}

function classify(name: string): { genre: Genre; franchise?: string } {
  for (const rule of FRANCHISE_RULES) {
    if (rule.test.test(name)) return { genre: rule.genre, franchise: rule.franchise };
  }
  for (const rule of GENRE_RULES) {
    if (rule.test.test(name)) return { genre: rule.genre };
  }
  return { genre: "Other" };
}

export function enrichTitle(
  name: string,
  category?: string
): { genre: Genre; franchise?: string; isApp: boolean } {
  if (isAppTitle(name, category)) return { genre: "Other", isApp: true };
  return { ...classify(name), isApp: false };
}

/** Token → platform, tested against the category first, then the title name. */
const PLATFORM_TOKENS: Array<[RegExp, Platform]> = [
  [/ps5|playstation®5/i, "PS5"],
  [/ps4|playstation®4/i, "PS4"],
  [/ps3|playstation®3/i, "PS3"],
  [/vita/i, "PSVITA"],
];

function platformFromText(text: string): Platform | undefined {
  for (const [test, platform] of PLATFORM_TOKENS) {
    if (test.test(text)) return platform;
  }
  return undefined;
}

/** Derive a console platform from the psn-api category (preferred) or title name. */
export function platformOf(category: string | undefined, name: string): Platform {
  return platformFromText(category ?? "") ?? platformFromText(name) ?? "OTHER";
}
