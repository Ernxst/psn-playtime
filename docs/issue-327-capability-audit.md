# Issue #327 capability-retention audit

This document records the `main` baseline inspected at `72bbd59` and maps every existing surface to the Playloom prototype. The prototype is presentation-only: it does not change account ingestion, enrichment, persistence, export formats, or server APIs.

## Routes and onboarding

| Existing surface or workflow                                   | Prototype location                                    | Retention evidence                                                                                     |
| -------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `/` onboarding route                                           | Playloom onboarding, promise → proof → trust → action | Demo profile is the primary action; PlayStation connect and one CSV restore path remain available.     |
| `/dashboard` personal-data route (`noindex`)                   | Continuous five-chapter dashboard                     | Route and `noindex` behaviour remain unchanged.                                                        |
| `/import` transaction bookmarklet receiver                     | Existing import receiver                              | Route and store integration remain unchanged.                                                          |
| NPSSO token instructions, acknowledgement and submit           | Connect PlayStation panel                             | Token remains password-equivalent, sent once, not stored; detailed steps are expandable.               |
| Cached account resume, remove account, transaction CSV restore | Account/profile control and onboarding account list   | Existing account switching, removal confirmation and per-account transaction restore remain available. |
| Dashboard CSV restore                                          | One secondary onboarding restore path                 | Games + account CSV pair remains accepted; the duplicate visual entry point is removed.                |
| Demo entry                                                     | Primary “Explore the demo” proof action               | Uses the same bundled dataset plus stable local prototype artwork and transaction fixtures.            |

## Profile chapter

| Existing capability                                                                                               | Prototype location                                                |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Profile avatar, online ID, PS Plus, trophy level/progress, cached timestamp                                       | Profile marquee and account control                               |
| Five overview metrics: total hours, games, sessions, average hours/game, average session                          | Five-value typographic strip                                      |
| Timeframes: all, last 12 months, last 2 years, current year                                                       | Profile filter bar, scoped to Profile/History/Library             |
| Game search                                                                                                       | Profile filter bar                                                |
| Genre, franchise, platform, last-played dates, hours, sessions, platinum, trophy progress, active/dormant filters | Full filter sheet/popover                                         |
| Top games by hours with exact hours                                                                               | Ranked poster list; first title featured; common-baseline bars    |
| Genre hours/share/game count                                                                                      | Horizontal share distribution with all three exact values visible |
| Franchise hours/game count                                                                                        | Ranked rows with cover stacks and exact values                    |
| Value vs RAWG typical playtime                                                                                    | Editorial “value” insight                                         |
| Active/dormant recency                                                                                            | Editorial activity insight                                        |
| Library longevity                                                                                                 | Editorial longevity insight                                       |
| Comebacks                                                                                                         | Editorial comeback insight                                        |
| Excluded-app transparency                                                                                         | Adjacent archive note                                             |

## History chapter

| Existing capability                                                | Prototype location                     |
| ------------------------------------------------------------------ | -------------------------------------- |
| Hours by most-recent year                                          | Full-width year view with exact totals |
| PSN lifetime-hours proxy caveat                                    | Immediately beside year view           |
| Binge/dip-in sessions with hours/session and launch count          | Ranked horizontal session bars         |
| Trophy level, total, platinum count, average completion            | Trophy metric strip                    |
| Platinum/gold/silver/bronze distribution                           | Trophy split with exact counts         |
| Completion spectrum                                                | Completion distribution                |
| Platinum games                                                     | Poster-led platinum shelf              |
| Platinum within reach                                              | Near-completion rows                   |
| Recent trophy activity                                             | Recent trophy rows                     |
| Trophy outage/incomplete data message and matched-list denominator | Adjacent caveats retained              |

## Spending chapter

| Existing capability                                                  | Prototype location                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Import guide/bookmarklet, copy, open history, CSV import             | Visible data utility row                                            |
| Total spend, matched spend, unmatched spend, average paid, discounts | Spending metric strip                                               |
| Value leaders and unmatched note                                     | Spending overview                                                   |
| Spend by year                                                        | Full-width year bars                                                |
| Purchase history sorting                                             | Ledger column sort controls                                         |
| Purchase-date, product, type, matched/unmatched controls             | New chapter-local transaction controls; do not reuse game timeframe |
| Most-spent titles with per-hour value                                | Ranked cover bars with base/add-on split and totals                 |
| Add-on spend                                                         | Cover-led add-on list                                               |
| Games/account/transaction CSV exports                                | Data controls in Tools                                              |
| Remove imported transactions confirmation                            | Destructive controls in Tools                                       |

## Library and Tools chapters

| Existing capability                                                                           | Prototype location                                                                                                                      |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Sortable all-games table: title, platform, hours, sessions, first played, last played         | Dense cover-led desktop table and information-equivalent mobile rows                                                                    |
| Ask AI question search, grouped catalogue, menu mode, prompt preview                          | Side-by-side Ask AI catalogue and generated prompt                                                                                      |
| Copy prompt, ChatGPT, Claude and download actions                                             | Ask AI action row                                                                                                                       |
| Export games/account/transactions                                                             | Visible data-control rows                                                                                                               |
| Sign out                                                                                      | Quiet separate account action                                                                                                           |
| Refresh with NPSSO instructions, acknowledgement, inline errors, token retention and progress | Right sheet on desktop, full-width bottom sheet on mobile; safe signed-in demo simulates success without accepting/transmitting a token |

## States and constraints

| State or constraint                   | Prototype evidence hook                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Loading                               | `/dashboard?prototypeState=loading`                                                                       |
| Empty                                 | `/dashboard?prototypeState=empty`                                                                         |
| Error                                 | `/dashboard?prototypeState=error`                                                                         |
| Ordinary demo                         | `/dashboard`                                                                                              |
| Safe signed-in demo                   | `/dashboard?prototypeState=signed-in`                                                                     |
| Missing artwork                       | Deterministic title poster in the library and ranked lists                                                |
| Partial RAWG enrichment               | Stable fixtures exercise the PSN → local atlas → deterministic chain; RAWG comparisons retain attribution |
| Long titles and dense transactions    | Stable long-title game and dense prototype ledger rows                                                    |
| Keyboard, focus, hit targets          | Native buttons/anchors/inputs, visible `:focus-visible`, ≥44px app controls                               |
| Responsive charts, posters and ledger | Desktop table becomes labelled stacked rows; distributions and posters keep exact values                  |
| Reduced motion                        | Motion media query removes smooth scrolling and transition duration; no continuous dashboard motion       |

## Capability-retention result

All existing routes, metrics, charts, insights, controls, states and workflows remain present. No capability is removed, collapsed, hidden behind chapter tabs, or assigned a different data meaning. The prototype adds only presentation fixtures and safe evaluation states required by issue #327.
