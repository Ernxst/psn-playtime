import {
  HttpResponse,
  http,
  type DefaultBodyType,
  type HttpResponseResolver,
  type PathParams,
} from "msw";
import { TRANSACTION_HISTORY_ENDPOINT } from "@/domain/transaction-bookmarklet";
import * as Psn from "@/test/factories/psn";
import * as Transactions from "@/test/factories/transactions";
import { rawgSearch, rawgSeries } from "./rawg-fixtures";

const PSN_API_BASE_URL = "https://m.np.playstation.com/api/";
const PSN_AUTH_BASE_URL = "https://ca.account.sony.com/api/authz/v3/oauth/";
const PSN_PROFILE_BASE_URL = "https://us-prof.np.community.playstation.net/userProfile/v1/";
const RAWG_BASE_URL = "https://api.rawg.io/api/";

export const psnApiUrl = (path: string): string => new URL(path, PSN_API_BASE_URL).href;
export const psnAuthUrl = (path: string): string => new URL(path, PSN_AUTH_BASE_URL).href;
export const psnProfileUrl = (path: string): string => new URL(path, PSN_PROFILE_BASE_URL).href;
export const rawgUrl = (path: string): string => new URL(path, RAWG_BASE_URL).href;
const unauthorized = () => new HttpResponse<null>(null, { status: 401 });
const forbidden = () => new HttpResponse<null>(null, { status: 403 });

type RequestPolicy = (input: Parameters<HttpResponseResolver>[0]) => HttpResponse<null> | undefined;

function withPolicy(policy: RequestPolicy) {
  return function policyResolver<
    Params extends PathParams,
    RequestBody extends DefaultBodyType,
    ResponseBody extends DefaultBodyType,
  >(
    resolver: HttpResponseResolver<Params, RequestBody, ResponseBody>
  ): HttpResponseResolver<Params, RequestBody, ResponseBody | null> {
    return (input) => policy(input) ?? resolver(input);
  };
}

const withAuthorization = withPolicy(({ request }) =>
  request.headers.get("authorization") ? undefined : unauthorized()
);

const withNpsso = withPolicy(({ cookies }) => (cookies.npsso ? undefined : unauthorized()));

const withRawgKey = withPolicy(({ request }) =>
  new URL(request.url).searchParams.get("key") === "test-key" ? undefined : forbidden()
);

export const withTransactionCredentials = withPolicy(({ request }) => {
  const valid =
    request.credentials === "include" &&
    request.headers.get("apollographql-client-name") === "@sie-ppr-web-checkout/app" &&
    request.headers.get("x-psn-storefront-type") === "checkout:pdc" &&
    request.headers.has("x-psn-request-id");
  return valid ? undefined : unauthorized();
});

export const handlers = [
  http.get(
    psnAuthUrl("authorize"),
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
    psnAuthUrl("token"),
    withAuthorization(() => HttpResponse.json(Psn.tokenResponse()))
  ),
  http.get(
    psnProfileUrl("users/me/profile2"),
    withAuthorization(() => HttpResponse.json(Psn.profile()))
  ),
  http.get(
    psnApiUrl("gamelist/v2/users/me/titles"),
    withAuthorization(() => HttpResponse.json(Psn.playedPage()))
  ),
  http.get(
    psnApiUrl("trophy/v1/users/me/trophyTitles"),
    withAuthorization(() => HttpResponse.json(Psn.trophyPage()))
  ),
  http.get(
    rawgUrl("games"),
    withRawgKey(() => HttpResponse.json(rawgSearch()))
  ),
  http.get(
    rawgUrl("games/:id/game-series"),
    withRawgKey(() => HttpResponse.json(rawgSeries()))
  ),
  http.get(
    TRANSACTION_HISTORY_ENDPOINT,
    withTransactionCredentials(() => HttpResponse.json(Transactions.historyResponse([])))
  ),
];
