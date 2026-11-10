
import { apiRequest } from "./client";

// Verify a shopping proposal with the backend security firewall
export function verifyProposal(verificationData) {
  return apiRequest(
    "POST",
    "/security/verify",
    verificationData
  );
}
