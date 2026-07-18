import { setupServer } from "msw/node";
import { afterAll, afterEach } from "vitest";
import { handlers } from "./msw-handlers";

export const server = setupServer(...handlers);

server.listen({ onUnhandledRequest: "error" });
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
