import { createFileRoute } from "@tanstack/react-router";
import { ImportReceiver } from "@/components/import/import-receiver";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: ImportReceiver,
});
