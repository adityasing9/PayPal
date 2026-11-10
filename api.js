// Framework-free request handler: all routes + validation live here, so they can be tested
// without Express. server.js is only a thin wrapper that plugs this into Express.
import { CommerceAgent, searchProducts, getProduct } from "./agent.js";

export function createApi(agent = new CommerceAgent()) {
  const err = (status, detail) => ({ status, body: { detail } });

  return function handleRequest({ method, path, query = {}, body = {} }) {
    path = path.replace(/\/+$/, "") || "/";

    if (method === "GET" && path === "/health")
      return { status: 200, body: { status: "ok", module: "ai_commerce_agent" } };

    if (method === "GET" && path === "/products") {
      const limit = query.limit === undefined ? 20 : Number(query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) return err(422, "limit must be an integer 1-100");
      let max_price;
      if (query.max_price !== undefined) {
        max_price = Number(query.max_price);
        if (Number.isNaN(max_price)) return err(422, "max_price must be a number");
      }
      return { status: 200, body: searchProducts({ category: query.category, max_price, color: query.color, limit }) };
    }

    let m = path.match(/^\/products\/([^/]+)$/);
    if (method === "GET" && m) {
      const x = getProduct(decodeURIComponent(m[1]));
      return x ? { status: 200, body: x } : err(404, "Product not found");
    }

    if (method === "POST" && path === "/agent/chat") {
      const { user_id, message } = body ?? {};
      if (typeof user_id !== "string" || !user_id.trim()) return err(422, "user_id is required");
      if (typeof message !== "string" || !message.trim() || message.length > 500)
        return err(422, "message is required (max 500 chars)");
      return { status: 200, body: agent.handle(user_id, message) };
    }

    m = path.match(/^\/cart\/([^/]+)$/);
    if (method === "GET" && m) return { status: 200, body: agent._s(decodeURIComponent(m[1])).cart };

    return err(404, "Not found");
  };
}
