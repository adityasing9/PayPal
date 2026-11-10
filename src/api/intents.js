
import { apiRequest } from "./client";

// Create a new shopping intent
export function createShoppingIntent(intentData) {
  return apiRequest(
    "POST",
    "/intents",
    intentData
  );
}

// Get all shopping intents for the logged-in user
export function getShoppingIntents() {
  return apiRequest(
    "GET",
    "/intents"
  );
}

// Get a specific shopping intent
export function getShoppingIntent(intentId) {
  return apiRequest(
    "GET",
    `/intents/${encodeURIComponent(intentId)}`
  );
}
