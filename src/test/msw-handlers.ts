import { HttpResponse, http, type DefaultBodyType, type ResponseResolver } from "msw";
import { TRANSACTION_HISTORY_ENDPOINT } from "@/domain/transaction-bookmarklet";
import * as Psn from "@/test/factories/psn";
import * as Transactions from "@/test/factories/transactions";
import { rawgSearch, rawgSeries } from "./rawg-fixtures";

export const PSN_AUTH_URL = "https://ca.account.sony.com/api/authz/v3/oauth";
const RAWG_API_URL = "https://api.rawg.io/api/";

export const psnAuthUrl = (path: string): string => new URL(path, `${PSN_AUTH_URL}/`).href;
export const rawgUrl = (path: string): string => new URL(path, RAWG_API_URL).href;

export const PSN_AUTHORIZE_URL = psnAuthUrl("authorize");
export const PSN_TOKEN_URL = psnAuthUrl("token");
export const PSN_PROFILE_URL =
  "https://us-prof.np.community.playstation.net/userProfile/v1/users/me/profile2";
export const PSN_PLAYED_GAMES_URL = "https://m.np.playstation.com/api/gamelist/v2/users/me/titles";
export const PSN_TROPHY_TITLES_URL =
  "https://m.np.playstation.com/api/trophy/v1/users/me/trophyTitles";
export const RAWG_GAMES_URL = rawgUrl("games");
export const RAWG_SERIES_URL = rawgUrl("games/:id/game-series");

const unauthorized = () => new HttpResponse<null>(null, { status: 401 });
const forbidden = () => new HttpResponse<null>(null, { status: 403 });

type RequestPolicy = (request: Request) => HttpResponse<null> | undefined;

function withPolicy(policy: RequestPolicy) {
  return function policyResolver<
    Extra extends Record<string, unknown>,
    RequestBody extends DefaultBodyType,
    ResponseBody extends DefaultBodyType,
  >(
    resolver: ResponseResolver<Extra, RequestBody, ResponseBody>
  ): ResponseResolver<Extra, RequestBody, ResponseBody | null> {
    return (input) => policy(input.request) ?? resolver(input);
  };
}

const withAuthorization = withPolicy((request) =>
  request.headers.get("authorization") ? undefined : unauthorized()
);

const withNpsso = withPolicy((request) => {
  const cookie = request.headers.get("cookie");
  const hasNpsso = cookie
    ?.split(";")
    .some((part) => part.trim().startsWith("npsso=") && part.trim() !== "npsso=");
  return hasNpsso ? undefined : unauthorized();
});

const withRawgKey = withPolicy((request) =>
  new URL(request.url).searchParams.get("key") === "test-key" ? undefined : forbidden()
);

export const withTransactionCredentials = withPolicy((request) => {
  const valid =
    request.credentials === "include" &&
    request.headers.get("apollographql-client-name") === "@sie-ppr-web-checkout/app" &&
    request.headers.get("x-psn-storefront-type") === "checkout:pdc" &&
    request.headers.has("x-psn-request-id");
  return valid ? undefined : unauthorized();
});

export const handlers = [
  http.get(
    PSN_AUTHORIZE_URL,
    withNpsso(
      () =>
        new HttpResponse(null, {
          status: 302,
          headers: {
            Location: "https://example.test/redirect/?code=access-code&cid=test-correlation-id",
          },
        })
    )
  ),
  http.post(
    PSN_TOKEN_URL,
    withAuthorization(() => HttpResponse.json(Psn.tokenResponse()))
  ),
  http.get(
    PSN_PROFILE_URL,
    withAuthorization(() => HttpResponse.json(Psn.profile()))
  ),
  http.get(
    PSN_PLAYED_GAMES_URL,
    withAuthorization(() => HttpResponse.json(Psn.playedPage()))
  ),
  http.get(
    PSN_TROPHY_TITLES_URL,
    withAuthorization(() => HttpResponse.json(Psn.trophyPage()))
  ),
  http.get(
    RAWG_GAMES_URL,
    withRawgKey(() => HttpResponse.json(rawgSearch()))
  ),
  http.get(
    RAWG_SERIES_URL,
    withRawgKey(() => HttpResponse.json(rawgSeries()))
  ),
  http.get(
    TRANSACTION_HISTORY_ENDPOINT,
    withTransactionCredentials(() => HttpResponse.json(Transactions.historyResponse([])))
  ),
];
