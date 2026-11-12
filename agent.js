// Member 1 - AI Commerce Agent (PayPal Hackathon). Pure JavaScript, no dependencies.
// Flow: parse user text -> search catalog -> recommend -> cart -> build a PURCHASE INTENT
// that Member 2 (IntentLock) must authorize before Member 3 (PayPal) charges anything.
// The agent NEVER takes payment itself.
import { randomUUID } from "node:crypto";

// ---------- 1. Product data (Member 5 will replace this with the real DB) ----------
const p = (id, name, category, brand, color, price, stock, rating, tags) =>
  ({ id, name, category, brand, color, price, stock, rating, tags });

export const CATALOG = [
  p("P001", "AeroRun Pro Running Shoes", "shoes", "AeroRun", "black", 79.0, 25, 4.6, ["running", "sport", "lightweight"]),
  p("P002", "AeroRun Lite Running Shoes", "shoes", "AeroRun", "white", 59.0, 40, 4.2, ["running", "sport", "budget"]),
  p("P003", "UrbanStep Casual Sneakers", "shoes", "UrbanStep", "black", 65.0, 18, 4.4, ["casual", "daily"]),
  p("P004", "TrailMax Hiking Boots", "shoes", "TrailMax", "green", 120.0, 8, 4.7, ["hiking", "outdoor", "waterproof"]),
  p("P005", "SprintX Elite Running Shoes", "shoes", "SprintX", "blue", 140.0, 0, 4.8, ["running", "sport", "premium"]),
  p("P006", "ZenBook Air 14 Laptop", "laptops", "Zen", "silver", 899.0, 12, 4.5, ["work", "lightweight", "portable"]),
  p("P007", "GameForce 15 Laptop", "laptops", "GameForce", "black", 1299.0, 5, 4.6, ["gaming", "performance"]),
  p("P008", "StudyBook 13 Laptop", "laptops", "Zen", "grey", 499.0, 30, 4.1, ["student", "budget", "portable"]),
  p("P009", "Nova X Smartphone", "phones", "Nova", "black", 699.0, 20, 4.5, ["camera", "5g"]),
  p("P010", "Nova Lite Smartphone", "phones", "Nova", "blue", 299.0, 35, 4.2, ["budget", "5g"]),
  p("P011", "BassBoom Wireless Headphones", "headphones", "BassBoom", "black", 89.0, 50, 4.4, ["wireless", "bass", "travel"]),
  p("P012", "QuietPro Noise-Cancelling Headphones", "headphones", "QuietPro", "white", 199.0, 15, 4.7, ["wireless", "noise-cancelling", "travel"]),
  p("P013", "FitTrack Smartwatch", "watches", "FitTrack", "black", 149.0, 22, 4.3, ["fitness", "sport", "waterproof"]),
  p("P014", "CityPack 25L Backpack", "bags", "CityPack", "grey", 45.0, 60, 4.4, ["travel", "work", "daily"]),
  p("P015", "Laptop Sleeve 14-inch", "bags", "CityPack", "black", 25.0, 80, 4.3, ["work", "protection"]),
  p("P016", "DryFit Sport T-Shirt", "shirts", "AeroRun", "blue", 22.0, 100, 4.2, ["running", "sport", "lightweight"]),
];
const COMPLEMENTS = { laptops: "bags", phones: "headphones", shoes: "shirts", watches: "headphones" };

export const getProduct = (pid) => CATALOG.find((x) => x.id === pid) ?? null;
const round2 = (n) => Math.round(n * 100) / 100;
const money = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n)); // 79 -> "79.0"
const has = (o) => Object.keys(o).length > 0;

// ---------- 2. Search ----------
export function searchProducts({ category, max_price, min_price, color, brand, tags, in_stock = true, limit = 5 } = {}) {
  const out = [];
  for (const x of CATALOG) {
    if (in_stock && x.stock <= 0) continue;
    if (category && x.category !== category) continue;
    if (max_price != null && x.price > max_price) continue;
    if (min_price != null && x.price < min_price) continue;
    if (color && x.color !== color) continue;
    if (brand && x.brand.toLowerCase() !== String(brand).toLowerCase()) continue;
    const overlap = (tags ?? []).filter((t) => x.tags.includes(t)).length;
    out.push([x.rating + 0.5 * overlap, x]);
  }
  return out.sort((a, b) => b[0] - a[0]).map(([, x]) => x).slice(0, limit);
}

// ---------- 3. Natural-language understanding (rule based, no LLM needed) ----------
const CATEGORY_WORDS = {
  shoes: ["shoe", "shoes", "sneaker", "sneakers", "footwear", "boots"],
  laptops: ["laptop", "laptops", "notebook"],
  phones: ["phone", "phones", "smartphone", "mobile"],
  headphones: ["headphone", "headphones", "earbuds", "earphones"],
  watches: ["watch", "watches", "smartwatch"],
  bags: ["bag", "bags", "backpack", "backpacks", "sleeve"],
  shirts: ["shirt", "shirts", "tshirt", "t-shirt", "tee"],
};
const COLORS = ["black", "white", "blue", "green", "grey", "gray", "silver", "red"];
const ALL_TAGS = [...new Set(CATALOG.flatMap((x) => x.tags))].sort();
const BRANDS = [...new Set(CATALOG.map((x) => x.brand))].sort();
const ORDINALS = { first: 0, "1st": 0, second: 1, "2nd": 1, third: 2, "3rd": 2, last: -1 };
const INJECTION = /ignore (all |any |the )?(previous|prior|above|your)|system prompt|override|disregard .*(rules|instructions)|for free|bypass|jailbreak/i;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function parseQuery(text) {
  const t = text.toLowerCase();
  const f = {};
  for (const [cat, words] of Object.entries(CATEGORY_WORDS)) {
    if (words.some((w) => new RegExp(`\\b${escapeRe(w)}\\b`).test(t))) { f.category = cat; break; }
  }
  let m = t.match(/between\s*\$?(\d+(?:\.\d+)?)\s*(?:and|-|to)\s*\$?(\d+(?:\.\d+)?)/);
  if (m) { f.min_price = parseFloat(m[1]); f.max_price = parseFloat(m[2]); }
  else {
    m = t.match(/(?:under|below|less than|max|up ?to|within)\s*\$?(\d+(?:\.\d+)?)/);
    if (m) f.max_price = parseFloat(m[1]);
    m = t.match(/(?:over|above|more than|min)\s*\$?(\d+(?:\.\d+)?)/);
    if (m) f.min_price = parseFloat(m[1]);
  }
  for (const c of COLORS) {
    if (new RegExp(`\\b${c}\\b`).test(t)) { f.color = c === "gray" ? "grey" : c; break; }
  }
  for (const b of BRANDS) if (t.includes(b.toLowerCase())) { f.brand = b; break; }
  const tags = ALL_TAGS.filter((g) => t.includes(g));
  if (tags.length) f.tags = tags;
  return f;
}

export function detectIntent(text) {
  const t = text.toLowerCase().trim();
  if (/\b(buy|checkout|check out|purchase|pay|place (the |my )?order)\b/.test(t)) return "checkout";
  if (/\badd\b.*\b(cart|basket)\b|\badd (it|this|the|\d)/.test(t)) return "add_to_cart";
  if (t.includes("compare") || t.includes(" vs ")) return "compare";
  if (/\b(recommend|suggest|similar|alternative)/.test(t)) return "recommend";
  if (/\b(cheaper|cheapest|less expensive)\b/.test(t)) return "refine";
  if (/\b(my )?cart\b/.test(t)) return "view_cart";
  if (/^(hi|hello|hey)\b/.test(t)) return "greeting";
  return "search";
}

// ---------- 4. Recommendations (with explanations) ----------
export function recommendSimilar(pid, n = 3) {
  const base = getProduct(pid);
  const out = [];
  for (const x of CATALOG) {
    if (x.id === pid || x.stock <= 0 || x.category !== base.category) continue;
    const shared = x.tags.filter((t) => base.tags.includes(t)).sort();
    const score = 2 * shared.length + (x.brand === base.brand ? 1 : 0) + x.rating / 5;
    const why = `Same category (${x.category})` + (shared.length ? `, shares: ${shared.join(", ")}` : "");
    out.push([score, { ...x, why }]);
  }
  return out.sort((a, b) => b[0] - a[0]).map(([, x]) => x).slice(0, n);
}

export function crossSell(pid) {
  const base = getProduct(pid);
  const comp = COMPLEMENTS[base.category];
  const items = comp ? searchProducts({ category: comp, limit: 1 }) : [];
  return items.length ? [{ ...items[0], why: `Often bought together with your ${base.category.slice(0, -1)}` }] : [];
}

const view = (x, why) => ({
  id: x.id, name: x.name, price: x.price, rating: x.rating, stock: x.stock, color: x.color,
  why: why ?? x.why ?? "",
});

// ---------- 5. The agent ----------
export class CommerceAgent {
  constructor() { this.sessions = new Map(); }
  _s(uid) {
    if (!this.sessions.has(uid)) this.sessions.set(uid, { filters: {}, results: [], cart: [] });
    return this.sessions.get(uid);
  }
  _resp(s, reply, intent, products = [], purchase_intent = null) {
    return { reply, intent, products, cart: s.cart, purchase_intent };
  }

  // tool-style public methods (also used by the optional Claude tool-calling layer)
  addItem(userId, productId, qty = 1) {
    const s = this._s(userId), x = getProduct(productId);
    if (!x) return { ok: false, error: "Unknown product id" };
    const line = s.cart.find((l) => l.product_id === productId);
    const have = line ? line.qty : 0;
    if (qty < 1 || have + qty > x.stock) return { ok: false, error: `Only ${x.stock} in stock for ${x.name}` };
    if (line) line.qty += qty;
    else s.cart.push({ product_id: productId, name: x.name, qty, unit_price: x.price });
    return { ok: true, cart: s.cart };
  }

  prepareCheckout(userId, statedIntent = "") {
    const s = this._s(userId);
    if (!s.cart.length) return null;
    const total = round2(s.cart.reduce((a, l) => a + l.qty * l.unit_price, 0));
    return {
      intent_id: "INT-" + randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
      source: "ai_commerce_agent", user_id: userId, items: s.cart, total, currency: "USD",
      stated_intent: statedIntent, created_at: Math.floor(Date.now() / 1000),
      status: "PENDING_AUTHORIZATION",
      next_step: "POST to IntentLock /authorize; only if APPROVED -> PayPal create-order",
    };
  }

  handle(userId, message) {
    const s = this._s(userId);
    if (INJECTION.test(message)) {
      return this._resp(s, "I can't follow that. I only show real catalog products and never skip security checks or payment authorization.", "blocked");
    }
    const intent = detectIntent(message);
    let f = parseQuery(message);

    if (intent === "greeting")
      return this._resp(s, "Hi! Tell me what you're looking for, e.g. 'black running shoes under $80'.", intent);

    if (["search", "refine", "recommend"].includes(intent) && (has(f) || intent !== "search" || has(s.filters))) {
      if (intent === "recommend" && !f.category && s.results.length) {
        const recs = recommendSimilar(s.results[0].id);
        return this._resp(s, `Because you looked at ${s.results[0].name}, try these:`, intent, recs.map((x) => view(x)));
      }
      if (intent === "refine" && s.results.length) {
        f = { ...s.filters, max_price: round2(s.results[0].price - 0.01) }; // cheaper than top pick
      } else if (!f.category && has(s.filters) && has(f)) {
        f = { ...s.filters, ...f }; // follow-up like "what about in white?"
      }
      if (!has(f)) return this._resp(s, "What kind of product do you want?", "clarify");

      let results = searchProducts(f);
      const relaxed = [];
      for (const key of intent === "refine" ? [] : ["color", "brand", "max_price"]) { // relax if nothing found
        if (results.length) break;
        if (key in f) { delete f[key]; relaxed.push(key); results = searchProducts(f); }
      }
      if (intent === "refine" && !results.length)
        return this._resp(s, "Those are already the cheapest matches I have.", intent);
      s.filters = f; s.results = results;
      if (!results.length) return this._resp(s, "Sorry, nothing matches that in our catalog.", intent);
      const note = relaxed.length ? ` (no exact match, so I relaxed: ${relaxed.join(", ")})` : "";
      const top = results[0];
      return this._resp(s, `I found ${results.length} option(s)${note}. Top pick: ${top.name} at $${money(top.price)} (rating ${top.rating}).`,
        intent, results.map((x) => view(x, `Rating ${x.rating}, ${x.stock} in stock`)));
    }

    if (intent === "compare") {
      const items = s.results.slice(0, 3);
      if (items.length < 2) return this._resp(s, "Search for products first, then ask me to compare.", intent);
      return this._resp(s, "Here is a side-by-side comparison:", intent, items.map((x) => view(x)));
    }

    if (intent === "add_to_cart") {
      if (!s.results.length) return this._resp(s, "Search for a product first, then tell me which to add.", intent);
      const msg = message.toLowerCase();
      const hit = Object.entries(ORDINALS).find(([k]) => msg.includes(k));
      let idx = hit ? hit[1] : 0;
      if (idx >= s.results.length) idx = 0;
      if (idx < 0) idx = s.results.length - 1;
      const q = msg.match(/(\d+)\s*(?:x|pcs|pieces|of)\b|\bqty\s*(\d+)/);
      const qty = q ? parseInt(q[1] ?? q[2], 10) : 1;
      const x = s.results[idx];
      const res = this.addItem(userId, x.id, qty);
      if (!res.ok) return this._resp(s, res.error, intent);
      return this._resp(s, `Added ${qty} x ${x.name} to your cart.`, intent, crossSell(x.id).map((y) => view(y)));
    }

    if (intent === "view_cart") {
      const total = round2(s.cart.reduce((a, l) => a + l.qty * l.unit_price, 0));
      return this._resp(s, `Your cart has ${s.cart.length} item(s), total $${money(total)}.`, intent);
    }

    if (intent === "checkout") {
      const pi = this.prepareCheckout(userId, message);
      if (!pi) return this._resp(s, "Your cart is empty. Add something first.", intent);
      return this._resp(s, `Cart total is $${money(pi.total)}. I've sent this to IntentLock for security authorization. Payment happens only after it is approved.`,
        intent, [], pi);
    }
    return this._resp(s, "Could you tell me more about what you want?", "clarify");
  }
}
