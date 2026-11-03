import { createFileRoute } from "@tanstack/react-router";
import { signupClosed } from "@/server/signup";

export const Route = createFileRoute("/api/auth/signup")({
  server: {
    handlers: {
      POST: signupClosed,
    },
  },
});
