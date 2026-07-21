import { HttpResponse, http } from "msw";
import { TRANSACTION_HISTORY_ENDPOINT } from "@/domain/transaction-bookmarklet";
import * as Psn from "@/test/factories/psn";
import * as Transactions from "@/test/factories/transactions";
import { rawgSearch, rawgSeries } from "./rawg-fixtures";

export const PSN_AUTH_URL = "https://ca.account.sony.com/api/authz/v3/oauth";
export const PSN_PROFILE_URL =
  "https://us-prof.np.community.playstation.net/userProfile/v1/users/me/profile2";
export const PSN_PLAYED_GAMES_URL = "https://m.np.playstation.com/api/gamelist/v2/users/me/titles";
export const PSN_TROPHY_TITLES_URL =
  "https://m.np.playstation.com/api/trophy/v1/users/me/trophyTitles";
export const RAWG_GAMES_URL = "https://api.rawg.io/api/games";
export const RAWG_SERIES_URL = "https://api.rawg.io/api/games/:id/game-series";

export const handlers = [
  http.get(
    `${PSN_AUTH_URL}/authorize`,
    () =>
      new HttpResponse(null, {
        status: 302,
        headers: {
          Location: "https://example.test/redirect/?code=access-code&cid=test-correlation-id",
        },
      })
  ),
  http.post(`${PSN_AUTH_URL}/token`, () => HttpResponse.json(Psn.tokenResponse())),
  http.get(PSN_PROFILE_URL, () => HttpResponse.json(Psn.profile())),
  http.get(PSN_PLAYED_GAMES_URL, () => HttpResponse.json(Psn.playedPage())),
  http.get(PSN_TROPHY_TITLES_URL, () => HttpResponse.json(Psn.trophyPage())),
  http.get(RAWG_GAMES_URL, () => HttpResponse.json(rawgSearch())),
  http.get(RAWG_SERIES_URL, () => HttpResponse.json(rawgSeries())),
  http.get(TRANSACTION_HISTORY_ENDPOINT, () => HttpResponse.json(Transactions.historyResponse([]))),
];
