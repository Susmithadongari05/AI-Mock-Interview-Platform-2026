import { Router } from 'express';
import authenticate from '../middleware/auth.middleware.js';

import {
  getHistory,
  deleteHistoryItem,
  clearHistory,
} from '../controllers/history.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', getHistory);

router.delete('/:id', deleteHistoryItem);

router.delete('/', clearHistory);

export default router;