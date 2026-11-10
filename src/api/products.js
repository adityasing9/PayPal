
import { apiRequest } from "./client";

// Get all products with optional filters
export function getProducts(filters = {}) {
  return apiRequest(
    "GET",
    "/products",
    undefined,
    {
      params: filters,
    }
  );
}

// Get a single product by ID
export function getProductById(productId) {
  return apiRequest(
    "GET",
    `/products/${encodeURIComponent(productId)}`
  );
}
