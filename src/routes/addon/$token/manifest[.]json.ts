import { createFileRoute } from "@tanstack/react-router";
import { addonHandler, MANIFEST, preflight } from "@/server/addon";
import { json } from "@/server/http";

export const Route = createFileRoute("/addon/$token/manifest.json")({
  server: {
    handlers: {
      OPTIONS: preflight,
      GET: ({ params }) => addonHandler(params.token, async () => json(MANIFEST)),
    },
  },
});
