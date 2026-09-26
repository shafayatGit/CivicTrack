import { Router } from 'express';
import * as wardController from './ward.controller.js';
import { createWardSchema, updateWardSchema } from './ward.validation.js';
import validate from '../../middleware/validate.js';
import { protect, adminOnly } from '../../middleware/auth.js';

const router = Router();

router.get('/', protect, wardController.listWards);
router.get('/:id', protect, wardController.getWard);

router.post(
  '/',
  protect,
  adminOnly,
  validate(createWardSchema),
  wardController.createWard,
);

router.put(
  '/:id',
  protect,
  adminOnly,
  validate(updateWardSchema),
  wardController.updateWard,
);

router.delete('/:id', protect, adminOnly, wardController.deleteWard);

export default router;
