export type PromptGroup =
  | "Engagement & enjoyment"
  | "Completion & habits"
  | "Trophies & completion"
  | "Taste & preferences"
  | "Recommendations"
  | "Backlog & what to play next"
  | "Profile & personality"
  | "Wrapped & shareable"
  | "Spending & value"
  | "More";

export const PROMPT_GROUPS = [
  "Engagement & enjoyment",
  "Completion & habits",
  "Trophies & completion",
  "Taste & preferences",
  "Recommendations",
  "Backlog & what to play next",
  "Profile & personality",
  "Wrapped & shareable",
  "Spending & value",
  "More",
] as const satisfies readonly PromptGroup[];

export interface PromptVariant {
  id: string;
  group: PromptGroup;
  question: string;
  instruction: string;
}

export const PROMPT_VARIANTS = [
  {
    id: "enjoyment-vs-time",
    group: "Engagement & enjoyment",
    question: "Which games gave me the most enjoyment relative to time played?",
    instruction:
      "Work out which games gave me the most enjoyment relative to the time I put in. Weigh hours, number of sessions and how recently I kept coming back, and call out the titles that clearly punched above their playtime.",
  },
  {
    id: "engaging-genres",
    group: "Engagement & enjoyment",
    question: "Which genres keep me engaged the longest?",
    instruction:
      "Tell me which genres keep me engaged the longest. Use my hours, session counts and how long each genre stays in rotation to rank them, and explain what keeps me hooked.",
  },
  {
    id: "lost-interest-fastest",
    group: "Engagement & enjoyment",
    question: "Which games lost my interest the fastest?",
    instruction:
      "Identify the games that lost my interest the fastest. Look for titles with few sessions, low hours and a short gap between first and last played, and describe what they have in common.",
  },
  {
    id: "session-balance",
    group: "Engagement & enjoyment",
    question: "Which games have the healthiest balance of session length and consistency?",
    instruction:
      "Find the games with the healthiest balance of session length and consistency. Use my hours-per-session and how steadily I returned to them, and explain why that balance is healthy.",
  },
  {
    id: "mechanics-return",
    group: "Engagement & enjoyment",
    question: "Which mechanics seem to keep me coming back?",
    instruction:
      "Infer which game mechanics seem to keep me coming back. Reason from the genres, franchises and the titles I sink repeated sessions into, and name the recurring mechanics.",
  },
  {
    id: "binge-vs-bursts",
    group: "Engagement & enjoyment",
    question: "Which games did I binge versus play in short bursts?",
    instruction:
      "Separate the games I binged from the ones I dipped into in short bursts, using hours divided by sessions (hours-per-session) read against each game's session count. Call out the long-sitting bingers versus the little-and-often titles, and weigh the result against genre — short, repeated sessions are the core loop for roguelikes, fighters, sports and arcade games, so read those as habit, not a failure to commit, never as low engagement. Treat low recorded hours as possibly under-reported by PSN rather than proof of a thin session.",
  },
  {
    id: "finish-vs-abandon",
    group: "Completion & habits",
    question: "What patterns separate the games I finish from the ones I abandon?",
    instruction:
      "Work out what patterns separate the games I finish from the ones I abandon. Compare trophy completion against hours, session counts and recency, and describe the difference.",
  },
  {
    id: "typical-completion",
    group: "Completion & habits",
    question: "What completion rate is typical for games I truly enjoy?",
    instruction:
      "Estimate what trophy completion rate is typical for the games I truly enjoy. Use my highest-engagement titles as the sample and report the pattern you see.",
  },
  {
    id: "time-no-progress",
    group: "Completion & habits",
    question: "Which games did I spend a lot of time in without making much progress?",
    instruction:
      "Point out the games where I spent a lot of hours without making much trophy progress. List them and suggest why the time didn't convert into completion.",
  },
  {
    id: "finishing-blockers",
    group: "Completion & habits",
    question: "What habits are preventing me from finishing more games?",
    instruction:
      "Diagnose the habits that are stopping me from finishing more games. Use my session style, abandonment patterns and how spread my hours are, and give concrete, honest observations.",
  },
  {
    id: "closest-platinums",
    group: "Trophies & completion",
    question: "Which platinums am I closest to?",
    instruction:
      "Find the platinums I'm closest to earning. Look only at games where a platinum is available but not yet earned, and rank them by how near completion I am — lean on each game's trophy progress % and the earned-versus-defined counts (P/G/S/B earned against what the game defines). Caveat honestly: I have NO trophy-rarity or difficulty data, so 'close on paper' doesn't mean the remaining trophies are easy or quick — a high progress % can still hide a brutal grind or a missable. Games marked 'no platinum available' are out of scope, and 'trophies unknown (no data)' means UNKNOWN, never zero progress.",
  },
  {
    id: "completionist-or-mover",
    group: "Trophies & completion",
    question: "Am I a completionist, or do I move on?",
    instruction:
      "Judge whether I'm a completionist or someone who moves on, reading the earned-versus-defined trophy ratios across my whole library alongside the completionist baseline above (how often I platinum games that allow it). Weigh how consistently I push games to high completion versus leaving them part-finished. Be fair about it: finishing a main story and skipping grindy endgame, DLC or multiplayer trophies is satisfied completion, not abandonment, so low completion isn't automatically 'moving on'. I have no trophy-difficulty or rarity data, and 'trophies unknown (no data)' stays UNKNOWN — never read dislike or incompletion off missing data.",
  },
  {
    id: "trophies-left-on-table",
    group: "Trophies & completion",
    question: "Which games have the most trophies left on the table?",
    instruction:
      "Point out the games with the most trophies left unearned — the biggest gap between what each game defines and what I've earned, read from the progress % and the earned P/G/S/B counts. Favour titles I clearly invested in (high hours or sessions) where the unfinished trophies are most notable. Caveat: a large gap is not a verdict of dislike — skipped grind, DLC or multiplayer trophies are legitimately left behind on a satisfied playthrough, and I have NO rarity or difficulty data to say how much effort the remainder really represents. 'trophies unknown (no data)' is UNKNOWN, not a full set left on the table.",
  },
  {
    id: "hardest-earned-platinums",
    group: "Trophies & completion",
    question: "Which of my platinums were the hardest-earned?",
    instruction:
      "Among the games where I actually earned the platinum, reason about which were the hardest-won. Be explicit up front that my data carries NO trophy-rarity, difficulty or completion-percentage-of-other-players figures — so you must reason from your OWN knowledge of each title's reputation for grind, skill ceiling, missables or time-to-platinum, not from anything in the numbers. Use my hours on each as a loose corroborating hint where it helps, but treat the difficulty ranking as outside knowledge and say so, flagging any platinum whose reputation you're unsure of rather than overclaiming.",
  },
  {
    id: "hidden-preferences",
    group: "Taste & preferences",
    question: "What hidden preferences can you infer from my play history?",
    instruction:
      "Infer the hidden preferences in my play history — the patterns I might not notice myself. Back each inference with specific games, genres or franchises from the data.",
  },
  {
    id: "taste-over-time",
    group: "Taste & preferences",
    question: "How has my taste in games changed over time?",
    instruction:
      "Describe how my taste in games has changed over time. Compare my older last-played titles against my recent ones and trace the shift in genres and franchises.",
  },
  {
    id: "consistent-franchises",
    group: "Taste & preferences",
    question: "Which franchises consistently match my preferences?",
    instruction:
      "Tell me which franchises consistently match my preferences. Rank them by hours, number of titles and how reliably I return, and explain the consistency.",
  },
  {
    id: "outliers",
    group: "Taste & preferences",
    question: "Which games were outliers compared to the rest of my library?",
    instruction:
      "Find the games that were outliers compared to the rest of my library. Flag titles that break my usual genre, franchise, hours or session patterns and say what makes each unusual.",
  },
  {
    id: "genre-taste-shift",
    group: "Taste & preferences",
    question: "How has my genre taste shifted over the years?",
    instruction:
      "Trace how my taste in genres has shifted over the years. Group each game's genre against its first- and last-played dates to see which genres dominated my earlier years versus which I lean into now, and describe the drift — what's risen, what's faded, what's stayed constant. Reason from the dates I have, not a session timeline: my data has NO per-period or time-of-day history, so work from when each game entered and left my rotation. Treat low recorded hours as possibly under-reported rather than a thin period, and don't read a faded genre as dislike — tastes move on without any judgement attached.",
  },
  {
    id: "franchise-loyalty",
    group: "Taste & preferences",
    question: "Which franchises am I most loyal to?",
    instruction:
      "Tell me which franchises I'm most loyal to. Rank them by how many titles I've played in each, the hours I've poured across them and how reliably I keep returning over time (first- and last-played spread). Distinguish deep loyalty — many entries played steadily across years — from a single big spike in one title. Weigh genre context: a live-service franchise I keep reopening reflects habit, and that's still loyalty. Missing trophy or playtime data is UNKNOWN, not disloyalty, and low recorded hours may be PSN under-reporting rather than a half-hearted return.",
  },
  {
    id: "another-chance",
    group: "Recommendations",
    question: "Which games deserve another chance based on my past behaviour?",
    instruction:
      "Recommend which games in my library deserve another chance based on my past behaviour. Favour good-fit titles I under-played or drifted away from, and justify each pick.",
  },
  {
    id: "one-backlog-pick",
    group: "Recommendations",
    question: "If you had to recommend one game from my backlog, which would it be and why?",
    instruction:
      "If you had to recommend exactly one game from my backlog (low-hours titles that fit my taste), pick one and explain in detail why it's the best next play for me.",
  },
  {
    id: "rec-upcoming",
    group: "Recommendations",
    question: "What upcoming releases would I be most interested in?",
    instruction:
      "Infer my taste from my most-played genres, favourite franchises and the specific titles I engaged with most (weighing hours, sessions and recency), then suggest upcoming, not-yet-released games I'd most likely be excited for — titles I don't already own or play. My data contains NO games catalogue and NO release calendar, so reason from your own knowledge of the games landscape to name candidates and judge what is still on the horizon. Explain why each pick fits my taste, and be honest that these are suggestions from outside knowledge, not derived from my data: release timing (and even whether a game is real or still coming) can be uncertain, so flag that rather than overclaim. Don't reason about price or what I paid — that isn't the question here.",
  },
  {
    id: "rec-out-now",
    group: "Recommendations",
    question: "Which games available now — old or new — would I enjoy?",
    instruction:
      "Infer my taste from my most-played genres, favourite franchises and the titles I engaged with most (weighing hours, sessions and recency), then suggest games available to play right now — old or new, any era — that I'd enjoy and don't already own or play. My data contains NO games catalogue, so reason from your own knowledge of what exists and is currently obtainable. Explain why each pick fits my taste, and be honest that these are suggestions from outside knowledge, not derived from my data, so treat availability as your best estimate rather than a certainty. Don't reason about price or what I paid — that isn't the question here.",
  },
  {
    id: "rec-recent",
    group: "Recommendations",
    question: "Which recently released games would I be interested in?",
    instruction:
      "Infer my taste from my most-played genres, favourite franchises and the titles I engaged with most (weighing hours, sessions and recency), then suggest recently released games — roughly the last ~12 months — that I'd be interested in and don't already own or play. My data contains NO games catalogue and NO release calendar, so reason from your own knowledge of the games landscape to name candidates and judge their timing. Explain why each pick fits my taste, and be honest that these are suggestions from outside knowledge, not derived from my data: release dates can be uncertain, so flag anything you're unsure sits inside that window rather than overclaim. Don't reason about price or what I paid — that isn't the question here.",
  },
  {
    id: "rec-throwback",
    group: "Recommendations",
    question: "Which throwback or classic games might I have missed?",
    instruction:
      "Infer my taste from my most-played genres, favourite franchises and the titles I engaged with most (weighing hours, sessions and recency), then suggest older or classic back-catalogue games — throwbacks I may have skipped — that I'd enjoy and don't already own or play. My data contains NO games catalogue, so reason from your own knowledge of gaming history to name candidates and judge which are genuinely older or classic. Explain why each pick fits my taste, and be honest that these are suggestions from outside knowledge, not derived from my data, so treat the 'classic' framing and whether I truly missed each one as your best estimate. Don't reason about price or what I paid — that isn't the question here.",
  },
  {
    id: "finish-next-owned",
    group: "Backlog & what to play next",
    question: "What should I finish next from what I already own?",
    instruction:
      "Pick what I should finish next from the games I already own, balancing three things: how much I've already invested (hours and sessions), how much is left to finish (incomplete trophy progress, earned-versus-defined counts), and recency (a game I touched recently is a more natural pick-up than one dormant for years). Favour titles where a real chunk of the experience is still on the table but I've shown genuine engagement. Reason from ownership and playtime only — this is NOT about what I bought, and there is NO price or spend data here, so never frame it as money spent. Low completion isn't dislike, and 'trophies unknown (no data)' is UNKNOWN, not unfinished.",
  },
  {
    id: "liked-but-drifted",
    group: "Backlog & what to play next",
    question: "Which games did I clearly like but drift away from?",
    instruction:
      "Surface the games I clearly liked but drifted away from — high hours (and where present, strong trophy progress or a long return span) paired with an old last-played date that shows I haven't been back. These are the lapsed favourites worth reviving, distinct from games I bounced off quickly. Use each game's hours against its first- and last-played dates; a big total long ago reads very differently from a smaller recent one. Drifting away is not a verdict of dislike — life and new releases pull attention — and low recorded hours may be PSN under-reporting, so weigh trophies and recency alongside the raw number.",
  },
  {
    id: "barely-played-owned",
    group: "Backlog & what to play next",
    question: "Which games in my library have I barely played?",
    instruction:
      "List the games in my library I've barely played — the lowest-hours, fewest-sessions titles that have sat largely untouched. Reason from ownership and playtime ONLY: do not frame these as games I 'bought' or money wasted, because my data here has NO price or spend information and that framing would need it. Be careful with the figures too — PSN can under-report or miss play time, so a near-zero hour count can understate real play, and 'trophies unknown (no data)' is UNKNOWN; treat a barely-played game as an opportunity to revisit, not proof I disliked it.",
  },
  {
    id: "personality-traits",
    group: "Profile & personality",
    question: "What personality traits can you infer from my gaming habits?",
    instruction:
      "Infer the personality traits suggested by my gaming habits. Tie each trait to concrete evidence in my genres, franchises, session style and completion patterns.",
  },
  {
    id: "profile-paragraph",
    group: "Profile & personality",
    question: "How would you describe my gaming profile in one paragraph?",
    instruction:
      "Describe my gaming profile in one vivid paragraph, grounded in my biggest games, favourite genres, session style and recency.",
  },
  {
    id: "someone-else",
    group: "Profile & personality",
    question: "If my play history belonged to someone else, what would stand out most?",
    instruction:
      "Imagine my play history belonged to a stranger. Tell me what would stand out most about them, citing the specific games and patterns that jump out.",
  },
  {
    id: "gaming-wrapped",
    group: "Wrapped & shareable",
    question: "Write me a shareable gaming 'wrapped'.",
    instruction:
      "Write me a shareable gaming 'wrapped' — a punchy, celebratory synthesis of the picture I already gave you, in the spirit of a year-in-review. Do NOT run fresh deep analysis or invent new metrics: pull the highlights straight from the summary above — my biggest games, signature genres, favourite franchises, standout session habits and how my year looked — and turn them into a few snappy, quotable lines I'd happily share. Keep the tone upbeat and light; round and headline rather than over-qualify. Where a number is soft (PSN can under-report hours, missing data is unknown), lean on the clear standouts rather than overclaiming precision.",
  },
  {
    id: "gaming-identity",
    group: "Wrapped & shareable",
    question: "Sum up my gaming identity in a few punchy lines.",
    instruction:
      "Sum up my gaming identity in a few punchy, shareable lines — a sharp character sketch, not an essay. This is synthesis only: distil what the summary above already shows about me — my signature genres, the franchises I'm loyal to, how I tend to play (binger or dipper, finisher or wanderer) and what stands out most — into a handful of memorable lines. Don't compute new analysis or invent metrics, and don't over-qualify; pick the boldest true through-lines and say them with flair, leaning on clear standouts where the underlying numbers are soft.",
  },
  {
    id: "binge-vs-steady",
    group: "More",
    question: "Which games did I binge in a short burst vs play steadily over a long time?",
    instruction:
      "Separate the games I binged in a short burst from the ones I played steadily over a long time. Use hours-per-session, session counts and the gap between first and last played.",
  },
  {
    id: "revivals",
    group: "More",
    question:
      "Which older games have I returned to recently (revivals), and which have I clearly moved on from?",
    instruction:
      "Identify my revivals — older games I've returned to recently — versus the ones I've clearly moved on from. Use each game's first and last played dates against its hours.",
  },
  {
    id: "under-explored-genre",
    group: "More",
    question:
      "Based on my genres and franchises, which genre have I under-explored that I'd probably enjoy?",
    instruction:
      "Based on my genres and franchises, name a genre I've under-explored that I'd probably enjoy, and suggest specific titles to start with.",
  },
  {
    id: "efficient-completionist",
    group: "More",
    question:
      "Which games have the best trophy completion relative to hours (efficient completionist)?",
    instruction:
      "Rank the games where I earned the best trophy completion relative to hours played — my most efficient completions — and describe what that says about how I play them.",
  },
  {
    id: "signature-genre",
    group: "More",
    question: "What's my signature genre, and how dominant is it versus everything else?",
    instruction:
      "Tell me my signature genre and how dominant it is versus everything else. Use the genre share of hours and games, and quantify the gap to the runner-up.",
  },
  {
    id: "last-12-months",
    group: "More",
    question: "Summarise my last ~12 months of gaming versus the year before.",
    instruction:
      "Summarise my last ~12 months of gaming versus the year before, using each game's last-played date. Call out what changed in genres, franchises and intensity.",
  },
  {
    id: "comfort-vs-one-and-done",
    group: "More",
    question: 'Which games are "comfort" titles I keep returning to versus one-and-done?',
    instruction:
      "Separate my comfort titles — the ones I keep returning to over a long span — from the one-and-done games. Use session counts and the first-to-last-played span.",
  },
  {
    id: "top-10-ranking",
    group: "More",
    question: "Rank my top 10 by hours and tell me what that ranking reveals about me.",
    instruction:
      "Rank my top 10 games by hours and tell me what that ranking reveals about me — the genres, franchises and play style it points to.",
  },
] as const satisfies readonly PromptVariant[];

export const SPEND_VARIANTS = [
  {
    id: "spend-over-time",
    group: "Spending & value",
    question: "How has my spending on games changed over time?",
    instruction:
      "Using the imported spend block, describe how my spending has changed over time — lean on the spend-by-year figures and the total, and call out my busiest and quietest spending periods. Treat spend as context about my buying habits, not a measure of enjoyment.",
  },
  {
    id: "cost-per-hour",
    group: "Spending & value",
    question: "Which games were the most and least expensive per hour I played?",
    instruction:
      "Rank my games by cost per hour played (matched spend ÷ lifetime hours) and call out the most and least expensive per hour. Read cost per hour as plain economics — hours per pound, not proof of enjoyment — and note where missing spend or very low hours make the figure unreliable.",
  },
  {
    id: "full-price-vs-sale",
    group: "Spending & value",
    question: "Which games did I buy at full price versus on a deep sale?",
    instruction:
      "Group my purchases by what I paid versus the original price — full-price or early buys against discounted and deep-sale ones — using each game's 'bought:' context. Read this as a signal of hype, patience and price-sensitivity, never as higher or lower enjoyment.",
  },
  {
    id: "add-on-spend",
    group: "Spending & value",
    question: "Where did my DLC and add-on spending go?",
    instruction:
      "Point out which games I invested in beyond the base game through DLC and add-ons, using the per-game add-on counts. Treat extra spend as a SUPPORTING commitment signal that only suggests enjoyment when playtime, recency or trophies agree.",
  },
  {
    id: "wallet-top-ups",
    group: "Spending & value",
    question: "How much did I top up my wallet versus spend on games?",
    instruction:
      "Compare my wallet top-ups against my actual game spend from the imported spend block. Be clear that top-ups fund the wallet and are not spend on any one game, and that unmatched or free titles are unknown spend, not zero.",
  },
  {
    id: "spend-on-barely-played",
    group: "Spending & value",
    question: "What did I spend on games I barely played?",
    instruction:
      "Using the imported spend block, point out the games I paid for but barely played — match each game's purchase against its lifetime hours and surface the ones with real spend and very little playtime. Read this as plain economics, not regret or a value verdict: spend is context about my buying, never a measure of enjoyment, and a low hour count may be PSN under-reporting rather than a game ignored. Be honest about coverage too — only matched purchases have a price, and PS Plus, pre-installs, free claims and unmatched buys are UNKNOWN spend, not zero, so frame the list as 'what I can see', not the whole library.",
  },
  {
    id: "free-vs-paid-played",
    group: "Spending & value",
    question: "Which of my PS Plus or free games did I actually play?",
    instruction:
      "Using the imported spend block, compare the games I got free or via PS Plus (the titles with no matched purchase — freeGames) against the ones I paid for (paidGames), and tell me which of the free ones I actually sank time into. Lean on hours, sessions and recency to judge which freebies earned a real place in my rotation. Be clear that 'no matched purchase' means UNKNOWN spend — PS Plus, pre-installs, free claims or simply an unmatched transaction — not necessarily a genuinely free game, so treat the free/paid split as imperfect. Playing a free game a lot is engagement, not a value judgement on what I paid.",
  },
  {
    id: "value-for-money",
    group: "Spending & value",
    question: "Which games gave me the best and worst value for money?",
    instruction:
      "Weigh what I paid for each game against how much I played it (and, where known, recency and trophies) to judge which gave the best and worst value for money. Reason about value yourself from the spend and playtime figures — there is no value score in the data — and flag games where missing spend makes the call uncertain.",
  },
] as const satisfies readonly PromptVariant[];

export const PLAY_PATTERN_GUIDANCE = [
  "Interpret session-length and session-count patterns RELATIVE to each game's listed genre/design — the same raw pattern means opposite things across genres, so never read short or repeated sessions as (dis)enjoyment without weighing the genre:",
  "- Roguelike / soulslike / fighting / sports / arcade: short, repeated sessions ARE the core loop and signal engagement, not frustration (e.g. lots of short runs in a punishing fighter is the design, not dislike).",
  "- Narrative / RPG / adventure: long contiguous sessions are expected; many tiny sessions may instead indicate bounce-off.",
  "- Live-service / multiplayer: session cadence reflects habit, not completion or enjoyment.",
  "Treat this as calibration to weigh against each game's genre, not a fixed per-genre verdict.",
].join("\n");

export const TROPHY_SIGNAL_GUIDANCE = [
  "Read platinum and high trophy counts as an enjoyment/commitment signal, but weight each one RELATIVE to my completionist baseline above (how often I platinum games that allow it):",
  "- A platinum from a low-baseline player (someone who rarely platinums) is a STRONG signal of enjoyment and investment in that title.",
  "- For a habitual platinum-hunter (high baseline) a platinum is expected and discriminates far less, so weight it down.",
  "- High trophy counts or completion % short of a platinum are a SOFTER version of the same signal — read them the same baseline-relative way.",
  "Honour these caveats and never overclaim:",
  "- 'trophies unknown (no data)' means UNKNOWN, NOT zero — never infer dislike or low engagement from missing trophy data.",
  "- 'no platinum available' (common for multiplayer/older titles) is NOT a negative signal; the absence of a platinum there says nothing about enjoyment.",
  "- I have no trophy-difficulty data, so don't assume a platinum was hard or easy; the baseline-relative framing is what gives a platinum its weight.",
].join("\n");

export const PLAYTIME_SIGNAL_GUIDANCE = [
  "When a game's line shows 'you: Xh lifetime vs typical ~Yh (~Nx)', read a ratio well above 1 (much longer than typical) as a SOFT enjoyment/engagement signal, weighed ALONGSIDE hours, recency and trophies — never as a primary metric:",
  "- 'typical' is RAWG's rough community-average time-to-complete, so treat the ratio as a loose hint, not a precise measure.",
  "- My hours are LIFETIME totals, so the ratio is most meaningful for completion-style games (narrative / RPG / adventure) where there's an end to reach.",
  "- Do NOT overweight it for clearly live-service / multiplayer games (e.g. FIFA / EA FC, Apex, Fortnite, Destiny) — they have no 'completion', so a huge ratio there reflects an ongoing habit, not finishing-and-loving a game.",
  "- The comparison is shown only for games where a typical time exists; its absence on a game says nothing — do not infer anything from a missing comparison.",
  "- A low recorded-hour count can itself be unreliable: PSN sometimes under-reports play time, so weight hours DOWN when trophies or completion contradict them — a fully-completed game showing only ~1h is the tell that real time played is far higher, never proof of low engagement.",
].join("\n");

export const COMPLETION_INTERPRETATION_GUIDANCE = [
  "Do NOT treat moderate or low trophy completion, or a game I 'stopped playing', as inherent dislike or abandonment — finishing the main story and skipping grindy endgame, DLC or multiplayer trophies is satisfied completion, not a bounce-off, especially for campaign and live-service titles:",
  "- Use the playtime-vs-typical-time line ('you: Xh lifetime vs typical ~Yh (~Nx)') to tell them apart: if my lifetime hours are roughly the typical completion time and then play stopped, that MAY indicate satisfied completion, even when trophy completion looks low.",
  "- Use genre/type the same way: 'campaign + live-service endgame' titles expect low post-campaign engagement, with a large share of trophies sitting behind grind, multiplayer or DLC that an engaged story-player legitimately skips — so low completion there is expected, not dislike.",
  "Do NOT flip the error the other way: a game with few hours, well SHORT of its typical completion time, and low trophies is still a genuine abandonment/bounce-off — use genre to TELL satisfied completion apart from abandonment, never to assume every incomplete game was finished and loved.",
  "- 'trophies unknown (no data)' stays UNKNOWN, not dislike — never read a satisfied-completion or abandonment verdict off missing trophy data.",
].join("\n");

export const ADD_ON_SIGNAL_GUIDANCE = [
  "When a game's line shows 'add-ons purchased: N', read buying DLC/add-ons as a SUPPORTING commitment/intent signal — NOT an enjoyment verdict on its own, and never a value computed in code; infer enjoyment only when it is corroborated by playtime, recency or trophies.",
  "Honour these caveats:",
  "- This signal exists only when I imported transaction history; absence of add-on purchases is NOT a negative signal.",
  "- DLC, bundle and re-release names do not always line up with the base title; unmatched add-ons are ignored gracefully, not misattributed.",
  "- Do not double-count bundles or base-game-with-DLC editions as add-ons.",
].join("\n");

export const PRICE_CONTEXT_GUIDANCE = [
  "When a game's line shows 'bought: <free|deep-sale|discounted|full-price>', read the price I paid versus the original price as a SUPPORTING context signal about my intent, patience, hype and value-sensitivity — NOT an enjoyment verdict, and never a value computed in code:",
  "- Paying full price or buying early can suggest hype or low price-sensitivity; waiting for a deep sale can suggest patience or caution — weigh this only alongside hours, recency and trophies, never on its own.",
  "Honour these caveats and never overclaim:",
  "- A sale or deep-sale purchase does NOT imply lower enjoyment.",
  "- A full-price purchase does NOT imply higher enjoyment by itself.",
  "- Missing spend data is UNKNOWN, not neutral or negative — most games have no imported price, and that absence says nothing about enjoyment or intent.",
  "- Attribution depends on transaction import quality; unmatched purchases are ignored gracefully, not misattributed.",
].join("\n");

export const SPEND_SIGNAL_GUIDANCE = [
  "When the 'Spend (imported transaction history)' block is present you can answer questions about my spend totals, spend over time, wallet top-ups and cost per hour played — but treat spend as a SUPPORTING context signal about my budgeting, patience and value-sensitivity, NEVER an enjoyment verdict, and never a value judgement baked into the figures: the numbers are factual cost, and deciding whether something was 'worth it' is your reasoning, weighed alongside hours, recency and trophies.",
  "Honour these caveats and never overclaim:",
  "- Cost per hour is just total matched spend ÷ lifetime hours — a low cost per hour means many hours per pound, NOT more enjoyment, and a high cost per hour does NOT imply regret.",
  "- Wallet top-ups fund the wallet balance and are NOT spend on any game — never attribute a top-up to a title or count it as a purchase.",
  "- Unmatched spend, and games with no matched purchase (PS Plus, pre-installs, free claims), are UNKNOWN, not zero — imported transactions cover only part of a library, so absent spend says nothing about enjoyment or intent.",
  "- These figures exist only because I imported transaction history, and DLC/bundle attribution is imperfect, so don't over-index on any single number.",
].join("\n");

export const METRIC_GUIDANCE_CAVEAT = [
  "The guidance below gives interpretive hints, NOT a scoring rubric: treat each signal (hours, recency, trophies, playtime-vs-typical-time, add-ons, price) as WEAK evidence on its own, and let no single metric dominate unless several independent signals agree.",
  "This is not a ban on ranking or scoring — when a question explicitly asks you to rank or score (e.g. top 10 by hours, rank my franchises), do exactly that, but build the ordering from converging signals rather than one metric, and don't invent a rigid points system.",
].join("\n");

export const METRIC_RUBRIC_GROUPS = new Set<PromptGroup>([
  "Engagement & enjoyment",
  "Completion & habits",
  "Trophies & completion",
  "Recommendations",
  "Backlog & what to play next",
  "More",
]);

export const MENU_MODE = "menu" as const;

export const MENU_INSTRUCTION =
  "Don't analyse anything yet. Briefly introduce what you can tell me from this data, then present a concise menu of what I could ask — grouped (Engagement & enjoyment, Completion & habits, Trophies & completion, Taste & preferences, Recommendations, Backlog & what to play next, Profile & personality, Wrapped & shareable, More) — and ask which I'd like to explore first.";
