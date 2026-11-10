import { Router } from 'express';
import authRoutes from './auth.routes.js';
import preferencesRoutes from './preferences.routes.js';
import productsRoutes from './products.routes.js';
import intentsRoutes from './intents.routes.js';
import proposalsRoutes from './proposals.routes.js';
import securityRoutes from './security.routes.js';
import paymentsRoutes from './payments.routes.js';

const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/user', preferencesRoutes);
apiRouter.use('/products', productsRoutes);
apiRouter.use('/intents', intentsRoutes);
apiRouter.use('/proposals', proposalsRoutes);
apiRouter.use('/security', securityRoutes);
apiRouter.use('/payments', paymentsRoutes);

export default apiRouter;
