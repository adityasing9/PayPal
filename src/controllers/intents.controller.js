import { intentService } from '../services/IntentService.js';

export async function createIntentController(req, res, next) {
  try {
    const intent = await intentService.createIntent({
      ...req.body,
      userId: req.user._id
    });

    return res.status(201).json({
      success: true,
      data: intent,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
}

export async function getIntentsController(req, res, next) {
  try {
    const intents = await intentService.getIntentsByUser(req.user._id);

    return res.status(200).json({
      success: true,
      data: { intents },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
}

export async function getIntentByIdController(req, res, next) {
  try {
    const intent = await intentService.getIntentById(req.params.id, req.user._id);

    return res.status(200).json({
      success: true,
      data: intent,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
}
