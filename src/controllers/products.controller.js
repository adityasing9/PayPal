import { catalogService } from '../services/CatalogService.js';

export async function listProductsController(req, res, next) {
  try {
    const { category, q } = req.query;
    const products = catalogService.listProducts({ category, q });

    return res.status(200).json({
      success: true,
      data: {
        products,
        total: products.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
}

export async function getProductByIdController(req, res, next) {
  try {
    const product = catalogService.getProductById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: `Product "${req.params.id}" not found in verified catalog.`,
          details: []
        },
        timestamp: new Date().toISOString()
      });
    }

    return res.status(200).json({
      success: true,
      data: { product },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
}
