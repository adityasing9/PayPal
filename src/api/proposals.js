
import { apiRequest } from "./client";

// Get a proposal by its ID
export function getProposal(proposalId) {
  return apiRequest(
    "GET",
    `/proposals/${encodeURIComponent(proposalId)}`
  );
}
