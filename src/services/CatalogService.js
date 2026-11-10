import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_PATH = path.resolve(__dirname, '../../data/catalog_fixture.json');

export class CatalogService {
  constructor() {
    this._products = null;
  }

  /**
   * Lazily loads and caches the 18 approved catalog fixture products.
   *
   * @returns {Array<object>}
   */
  getProductsFixture() {
    if (!this._products) {
      const raw = fs.readFileSync(FIXTURE_PATH, 'utf8');
      this._products = JSON.parse(raw);
    }
    return this._products;
  }

  /**
   * Lists products from the catalog with optional filtering and search.
   *
   * @param {{ category?: string, q?: string }} filters
   * @returns {Array<object>}
   */
  listProducts({ category, q } = {}) {
    let items = this.getProductsFixture();

    if (category) {
      const catLower = category.toLowerCase();
      items = items.filter((p) => p.category.toLowerCase() === catLower);
    }

    if (q) {
      const term = q.toLowerCase();
      items = items.filter(
        (p) =>
          p.title.toLowerCase().includes(term) ||
          p.merchantName.toLowerCase().includes(term) ||
          (p.description && p.description.toLowerCase().includes(term))
      );
    }

    return items;
  }

  /**
   * Retrieves a single product by externalId.
   *
   * @param {string} externalId
   * @returns {object | null}
   */
  getProductById(externalId) {
    const items = this.getProductsFixture();
    return items.find((p) => p.externalId === externalId) || null;
  }
}

export const catalogService = new CatalogService();
