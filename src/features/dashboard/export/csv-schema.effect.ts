/**
 * The CSV export/import CONTRACT, as pure `effect/Schema` — the round-trip
 * source of truth shared by the exporter here and the future importer (#312).
 *
 * Each CSV is one header-keyed `Schema.Struct` (`TransactionCsvRow`,
 * `GameCsvRow`): the struct's field KEYS are the exact column headers
 * (snake_case), and `Schema` preserves field order, so the header row is DERIVED
 * from the struct — there is no separate header list to drift. Each field is a
 * string ⇄ typed transform: the Encoded side is always a string cell, the Type
 * side is the typed value (money in minor units as integers, counts as numbers,
 * ISO-8601 dates and stable ids as strings). Optional columns encode an absent
 * value as the blank cell `""` and decode `""` back to `undefined`. `Schema.encode`
 * is export; `Schema.decode` is import — name-keyed, so reordered/extra columns
 * are tolerated.
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
 * The transactions CSV row contract: one row per imported transaction, the
 * complete round-trip source (purchases, top-ups, subscriptions). The field
 * keys are the CSV headers and their order is the column order.
 */
export const TransactionCsvRow = Schema.Struct({
  transaction_id: TextCell,
  key: TextCell,
  date: TextCell,
  transaction_type: TextCell,
  kind: TextCell,
  product_name: TextCell,
  sku_id: OptionalTextCell,
  sku_type: OptionalTextCell,
  quantity: NumberCell,
  amount_minor: NumberCell,
  currency: TextCell,
  display_amount: TextCell,
  original_price_minor: OptionalNumberCell,
  discount_minor: OptionalNumberCell,
});
export type TransactionCsvRow = Schema.Schema.Type<typeof TransactionCsvRow>;

/**
 * The games CSV row contract: the subset of transaction rows that matched a
 * library game, each enriched with that game's fields. Base game and every
 * add-on/DLC is its own row carrying the matched game's metadata. `amount_minor`
 * is the price paid; `original_price_minor` is the pre-discount price (blank when
 * the import did not carry it). The field keys are the CSV headers and their
 * order is the column order.
 */
export const GameCsvRow = Schema.Struct({
  transaction_id: TextCell,
  key: TextCell,
  date: TextCell,
  transaction_type: TextCell,
  kind: TextCell,
  product_name: TextCell,
  sku_id: OptionalTextCell,
  sku_type: OptionalTextCell,
  quantity: NumberCell,
  amount_minor: NumberCell,
  original_price_minor: OptionalNumberCell,
  discount_minor: OptionalNumberCell,
  currency: TextCell,
  title_id: TextCell,
  game_name: TextCell,
  platform: TextCell,
  hours: NumberCell,
  play_count: NumberCell,
  first_played: OptionalTextCell,
  last_played: OptionalTextCell,
  genre: TextCell,
  franchise: OptionalTextCell,
  typical_playtime: OptionalNumberCell,
  trophy_progress: OptionalNumberCell,
  trophy_earned_platinum: OptionalNumberCell,
  trophy_earned_gold: OptionalNumberCell,
  trophy_earned_silver: OptionalNumberCell,
  trophy_earned_bronze: OptionalNumberCell,
  trophy_has_platinum: OptionalBooleanCell,
});
export type GameCsvRow = Schema.Schema.Type<typeof GameCsvRow>;

/** Transactions CSV column headers, in order, derived from the schema field keys. */
export const TRANSACTION_CSV_COLUMNS = Object.keys(TransactionCsvRow.fields);

/** Games CSV column headers, in order, derived from the schema field keys. */
export const GAMES_CSV_COLUMNS = Object.keys(GameCsvRow.fields);

/** Encode a typed transactions row into its string cells (keyed by header). */
export const encodeTransactionCsvRow = Schema.encodeSync(TransactionCsvRow);

/** Encode a typed games row into its string cells (keyed by header). */
export const encodeGameCsvRow = Schema.encodeSync(GameCsvRow);
