import { Router } from 'express';
import queueController from '../../controllers/admin/queue.controller';
import { checkAdminAuth } from '../../middleware/check-admin-auth.middleware';

const router = Router();

// All routes require admin authentication
router.use(checkAdminAuth);

/**
 * @route   GET /api/admin/queues/stats
 * @desc    Get statistics for all queues
 * @access  Private (Admin)
 */
router.get('/stats', queueController.getQueueStats);

/**
 * @route   GET /api/admin/queues/:queueName/jobs
 * @desc    Get jobs for a specific queue
 * @access  Private (Admin)
 * @query   status (active, waiting, completed, failed, delayed)
 * @query   limit, offset
 */
router.get('/:queueName/jobs', queueController.getQueueJobs);

/**
 * @route   GET /api/admin/queues/:queueName/repeatable
 * @desc    Get repeatable jobs for a specific queue
 * @access  Private (Admin)
 */
router.get('/:queueName/repeatable', queueController.getRepeatableJobs);

/**
 * @route   POST /api/admin/queues/:queueName/jobs/:jobId/retry
 * @desc    Retry a failed job
 * @access  Private (Admin)
 */
router.post('/:queueName/jobs/:jobId/retry', queueController.retryJob);

/**
 * @route   DELETE /api/admin/queues/:queueName/clean
 * @desc    Clean old jobs from queue
 * @access  Private (Admin)
 * @body    grace (milliseconds), status, limit
 */
router.delete('/:queueName/clean', queueController.cleanQueue);

/**
 * @route   POST /api/admin/queues/:queueName/pause
 * @desc    Pause queue processing
 * @access  Private (Admin)
 */
router.post('/:queueName/pause', queueController.pauseQueue);

/**
 * @route   POST /api/admin/queues/:queueName/resume
 * @desc    Resume queue processing
 * @access  Private (Admin)
 */
router.post('/:queueName/resume', queueController.resumeQueue);

export default router;

