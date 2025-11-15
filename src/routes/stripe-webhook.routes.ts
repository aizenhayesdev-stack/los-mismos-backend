import { Router } from 'express';
import { handleStripeWebhook } from '../controllers/stripe-webhook.controller';
import express from 'express';

const router = Router();

/**
 * Stripe webhook endpoint
 * IMPORTANT: This route must use raw body parser, not JSON parser
 * The raw body is required for Stripe signature verification
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  handleStripeWebhook
);

export default router;
