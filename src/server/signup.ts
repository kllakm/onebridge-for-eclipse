import { json } from "./http";

/** Closed during owner testing, including direct requests to the signup endpoint. */
export function signupClosed() {
  return json({ error: "New signups are temporarily closed during testing." }, 403);
}