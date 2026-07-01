/**
 * The CSV export/import CONTRACT, as pure `effect/Schema` — the round-trip
 * source of truth shared by the exporters (`csv.ts`) and the dashboard importer
 * (`import-dashboard.ts`, #312).
 *
 * Each CSV is one header-keyed `Schema.Struct` (`TransactionCsvRow`,
 * `GameCsvRow`, `AccountCsvRow`): the struct's field KEYS are the exact column
 * headers (snake_case), and `Schema` preserves field order, so the header row is
 * DERIVED from the struct — there is no separate header list to drift. Each field
 * is a string ⇄ typed transform: the Encoded side is always a string cell, the
 * Type side is the typed value (money in minor units as integers, counts as
 * numbers, ISO-8601 dates and stable ids as strings). Optional columns encode an
 * absent value as the blank cell `""` and decode `""` back to `undefined`.
 * `Schema.encode` is export; `Schema.decode` is import — name-keyed, so
 * reordered/extra columns are tolerated.
 *
 * The money (minor units) and id cells carry a nominal `Schema.brand`, so a
 * decoded `amount_minor` cannot be mixed with a plain count and a `title_id`
 * cannot be mixed with any other string. Branding narrows the Type only; the
 * Encoded side stays a plain string cell, so it is purely additive to the wire
 * shape.
 *
 * This module lives under the strict `.effect.ts` glob (see `tsconfig.effect.json`)
 * for the Effect language-service checks. It imports ONLY `effect`, with no
 * runtime or type dependency on the domain modules, so those deliberately
 * non-Effect, dependency-light modules never get dragged into the strict program.
 * The domain→row projections and the RFC-4180 serialisation live in the plain
 * `csv.ts` builders, which import these schemas.
 */
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";

/** A required text cell: the string survives verbatim in both directions. */
const TextCell = Schema.String;

/**
 * A required numeric cell (minor units, counts, hours) carried as its decimal
 * string in the CSV. `FiniteFromString` is the round-trip (`1599` ⇄ `"1599"`)
 * and rejects `NaN`/`Infinity`, since every numeric column has a finite domain.
 */
const NumberCell = Schema.FiniteFromString;

/** An optional text cell: an absent value is the blank cell `""`, and vice-versa. */
const OptionalTextCell = Schema.String.pipe(
  Schema.decodeTo(Schema.UndefinedOr(Schema.String), {
    decode: SchemaGetter.transform((cell: string) => (cell === "" ? undefined : cell)),
    encode: SchemaGetter.transform((value: string | undefined) => value ?? ""),
  })
);

/** An optional numeric cell: an absent value is the blank cell `""`, never `0`. */
const OptionalNumberCell = Schema.String.pipe(
  Schema.decodeTo(Schema.UndefinedOr(Schema.Finite), {
    decode: SchemaGetter.transform((cell: string) => (cell === "" ? undefined : Number(cell))),
    encode: SchemaGetter.transform((value: number | undefined) =>
      value === undefined ? "" : String(value)
    ),
  })
);

/** A required boolean cell: `"true"`/`"false"` ⇄ `true`/`false`. */
const BooleanCell = Schema.String.pipe(
  Schema.decodeTo(Schema.Boolean, {
    decode: SchemaGetter.transform((cell: string) => cell === "true"),
    encode: SchemaGetter.transform((value: boolean) => String(value)),
  })
);

/** An optional boolean cell: absent is `""`, present is `"true"`/`"false"`. */
const OptionalBooleanCell = Schema.String.pipe(
  Schema.decodeTo(Schema.UndefinedOr(Schema.Boolean), {
    decode: SchemaGetter.transform((cell: string) => (cell === "" ? undefined : cell === "true")),
    encode: SchemaGetter.transform((value: boolean | undefined) =>
      value === undefined ? "" : String(value)
    ),
  })
);

/**
 * Money in minor currency units (pence/cents) as an integer, branded so a
 * decoded amount can never be accidentally mixed with a plain count or hours.
 * Required cell: the decimal string round-trips through `FiniteFromString`.
 */
const MinorUnits = NumberCell.pipe(Schema.brand("MinorUnits"));

/**
 * An optional {@link MinorUnits} cell: absent is the blank cell `""`, never `0`.
 * The brand is a Type-only nominal tag, so the getters transform the plain
 * `number` (the target's Encoded); the target schema carries the brand.
 */
const OptionalMinorUnitsCell = Schema.String.pipe(
  Schema.decodeTo(Schema.UndefinedOr(Schema.Finite.pipe(Schema.brand("MinorUnits"))), {
    decode: SchemaGetter.transform((cell: string) => (cell === "" ? undefined : Number(cell))),
    encode: SchemaGetter.transform((value: number | undefined) =>
      value === undefined ? "" : String(value)
    ),
  })
);

/** A stable transaction id, branded so it cannot be swapped with any other id. */
const TransactionId = TextCell.pipe(Schema.brand("TransactionId"));

/** A stable PSN account id, branded so it cannot be swapped with any other id. */
const AccountId = TextCell.pipe(Schema.brand("AccountId"));

/** A stable PSN title id, branded so it cannot be swapped with any other id. */
const TitleId = TextCell.pipe(Schema.brand("TitleId"));

/** An optional {@link TitleId} cell — blank for app rows, which carry no title id. */
const OptionalTitleIdCell = Schema.String.pipe(
  Schema.decodeTo(Schema.UndefinedOr(TitleId), {
    decode: SchemaGetter.transform((cell: string) => (cell === "" ? undefined : cell)),
    encode: SchemaGetter.transform((value: string | undefined) => value ?? ""),
  })
);

/**
 * The library-row kind: `"game"` for a played title carrying the full game
 * shape, `"app"` for an excluded streaming/music/browser app carrying only its
 * name and hours. A discriminated distinction, not an `isApp` boolean.
 */
const KindCell = Schema.Literals(["game", "app"]);

/**
 * The transactions CSV row contract: one row per imported transaction, the
 * complete round-trip source (purchases, top-ups, subscriptions). The field
 * keys are the CSV headers and their order is the column order.
 */
export const TransactionCsvRow = Schema.Struct({
  transaction_id: TransactionId,
  key: TextCell,
  date: TextCell,
  transaction_type: TextCell,
  kind: TextCell,
  product_name: TextCell,
  sku_id: OptionalTextCell,
  sku_type: OptionalTextCell,
  quantity: NumberCell,
  amount_minor: MinorUnits,
  currency: TextCell,
  display_amount: TextCell,
  original_price_minor: OptionalMinorUnitsCell,
  discount_minor: OptionalMinorUnitsCell,
});
export type TransactionCsvRow = Schema.Schema.Type<typeof TransactionCsvRow>;

/**
 * The games CSV row contract: the FULL library, one row per title — every game
 * AND every excluded app. The `kind` column discriminates the two: `"game"`
 * rows carry the complete `GamePlay` shape (play stats, enrichment, flattened
 * trophy counts); `"app"` rows carry only `name` and `hours`, leaving the
 * game-only columns blank. Spend is intentionally absent — it is derived from
 * the transactions CSV, not part of `DashboardData`. The field keys are the CSV
 * headers and their order is the column order.
 */
export const GameCsvRow = Schema.Struct({
  title_id: OptionalTitleIdCell,
  name: TextCell,
  kind: KindCell,
  platform: OptionalTextCell,
  hours: NumberCell,
  play_count: OptionalNumberCell,
  first_played: OptionalTextCell,
  last_played: OptionalTextCell,
  category: OptionalTextCell,
  genre: OptionalTextCell,
  franchise: OptionalTextCell,
  typical_playtime: OptionalNumberCell,
  image_url: OptionalTextCell,
  trophy_progress: OptionalNumberCell,
  trophy_earned_platinum: OptionalNumberCell,
  trophy_earned_gold: OptionalNumberCell,
  trophy_earned_silver: OptionalNumberCell,
  trophy_earned_bronze: OptionalNumberCell,
  trophy_total: OptionalNumberCell,
  trophy_has_platinum: OptionalBooleanCell,
  trophy_last_earned_at: OptionalTextCell,
});
export type GameCsvRow = Schema.Schema.Type<typeof GameCsvRow>;

/**
 * The account CSV row contract: ONE row, the non-derivable profile fields only.
 * `earned`/`totalTrophies` are omitted — the importer derives them by summing
 * the game trophy rows; `is_demo`/`trophies_unavailable` are omitted — the
 * importer sets them (imported data is never demo). The field keys are the CSV
 * headers and their order is the column order.
 */
export const AccountCsvRow = Schema.Struct({
  online_id: TextCell,
  account_id: AccountId,
  about_me: OptionalTextCell,
  avatar_url: OptionalTextCell,
  is_plus: BooleanCell,
  trophy_level: NumberCell,
  level_progress: NumberCell,
});
export type AccountCsvRow = Schema.Schema.Type<typeof AccountCsvRow>;

/** Transactions CSV column headers, in order, derived from the schema field keys. */
export const TRANSACTION_CSV_COLUMNS = Object.keys(TransactionCsvRow.fields);

/** Games CSV column headers, in order, derived from the schema field keys. */
export const GAMES_CSV_COLUMNS = Object.keys(GameCsvRow.fields);

/** Account CSV column headers, in order, derived from the schema field keys. */
export const ACCOUNT_CSV_COLUMNS = Object.keys(AccountCsvRow.fields);

/**
 * Encode a transactions row into its string cells (keyed by header). The
 * `Unknown` variant accepts the plain domain projection — the money/id brands are
 * Type-only nominal tags with no runtime check, so a plain number/string
 * validates and encodes without a narrowing cast at the projection seam.
 */
export const encodeTransactionCsvRow = Schema.encodeUnknownSync(TransactionCsvRow);

/** Encode a games row into its string cells (keyed by header). See {@link encodeTransactionCsvRow}. */
export const encodeGameCsvRow = Schema.encodeUnknownSync(GameCsvRow);

/** Encode an account row into its string cells (keyed by header). See {@link encodeTransactionCsvRow}. */
export const encodeAccountCsvRow = Schema.encodeUnknownSync(AccountCsvRow);
