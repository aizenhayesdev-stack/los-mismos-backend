import { Response } from 'express';
import { CustomRequest } from '../../interfaces/auth';
import ResponseUtil from '../../utils/Response/responseUtils';
import { STATUS_CODES } from '../../constants/statusCodes';
import {
  tripRemindersQueue,
  busCapacityQueue,
  notificationsQueue,
  QueueName,
} from '../../config/bullmq';

export class QueueController {
  /**
   * Get queue statistics
   * GET /api/admin/queues/stats
   */
  async getQueueStats(req: CustomRequest, res: Response) {
    try {
      const [
        tripRemindersStats,
        busCapacityStats,
        notificationsStats,
      ] = await Promise.all([
        this.getQueueCounts(tripRemindersQueue),
        this.getQueueCounts(busCapacityQueue),
        this.getQueueCounts(notificationsQueue),
      ]);

      const stats = {
        [QueueName.TRIP_REMINDERS]: tripRemindersStats,
        [QueueName.BUS_CAPACITY]: busCapacityStats,
        [QueueName.NOTIFICATIONS]: notificationsStats,
      };

      return ResponseUtil.successResponse(
        res,
        STATUS_CODES.SUCCESS,
        stats,
        'Queue statistics fetched successfully'
      );
    } catch (err: any) {
      console.error('Error fetching queue stats:', err);
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.INTERNAL_SERVER_ERROR,
        err.message
      );
    }
  }

  /**
   * Get jobs for a specific queue
   * GET /api/admin/queues/:queueName/jobs
   */
  async getQueueJobs(req: CustomRequest, res: Response) {
    try {
      const { queueName } = req.params;
      const { status = 'active', limit = 50, offset = 0 } = req.query;

      let queue;
      switch (queueName) {
        case QueueName.TRIP_REMINDERS:
          queue = tripRemindersQueue;
          break;
        case QueueName.BUS_CAPACITY:
          queue = busCapacityQueue;
          break;
        case QueueName.NOTIFICATIONS:
          queue = notificationsQueue;
          break;
        default:
          return ResponseUtil.errorResponse(
            res,
            STATUS_CODES.BAD_REQUEST,
            'Invalid queue name'
          );
      }

      let jobs;
      const limitNum = parseInt(limit as string);
      const offsetNum = parseInt(offset as string);

      switch (status) {
        case 'active':
          jobs = await queue.getActive(offsetNum, offsetNum + limitNum - 1);
          break;
        case 'waiting':
          jobs = await queue.getWaiting(offsetNum, offsetNum + limitNum - 1);
          break;
        case 'completed':
          jobs = await queue.getCompleted(offsetNum, offsetNum + limitNum - 1);
          break;
        case 'failed':
          jobs = await queue.getFailed(offsetNum, offsetNum + limitNum - 1);
          break;
        case 'delayed':
          jobs = await queue.getDelayed(offsetNum, offsetNum + limitNum - 1);
          break;
        default:
          return ResponseUtil.errorResponse(
            res,
            STATUS_CODES.BAD_REQUEST,
            'Invalid status'
          );
      }

      const jobsData = jobs.map((job) => ({
        id: job.id,
        name: job.name,
        data: job.data,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
      }));

      return ResponseUtil.successResponse(
        res,
        STATUS_CODES.SUCCESS,
        { jobs: jobsData },
        'Jobs fetched successfully'
      );
    } catch (err: any) {
      console.error('Error fetching queue jobs:', err);
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.INTERNAL_SERVER_ERROR,
        err.message
      );
    }
  }

  /**
   * Get repeatable jobs
   * GET /api/admin/queues/:queueName/repeatable
   */
  async getRepeatableJobs(req: CustomRequest, res: Response) {
    try {
      const { queueName } = req.params;

      let queue;
      switch (queueName) {
        case QueueName.TRIP_REMINDERS:
          queue = tripRemindersQueue;
          break;
        case QueueName.BUS_CAPACITY:
          queue = busCapacityQueue;
          break;
        case QueueName.NOTIFICATIONS:
          queue = notificationsQueue;
          break;
        default:
          return ResponseUtil.errorResponse(
            res,
            STATUS_CODES.BAD_REQUEST,
            'Invalid queue name'
          );
      }

      const repeatableJobs = await queue.getRepeatableJobs();

      return ResponseUtil.successResponse(
        res,
        STATUS_CODES.SUCCESS,
        { repeatableJobs },
        'Repeatable jobs fetched successfully'
      );
    } catch (err: any) {
      console.error('Error fetching repeatable jobs:', err);
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.INTERNAL_SERVER_ERROR,
        err.message
      );
    }
  }

  /**
   * Retry failed job
   * POST /api/admin/queues/:queueName/jobs/:jobId/retry
   */
  async retryJob(req: CustomRequest, res: Response) {
    try {
      const { queueName, jobId } = req.params;

      let queue;
      switch (queueName) {
        case QueueName.TRIP_REMINDERS:
          queue = tripRemindersQueue;
          break;
        case QueueName.BUS_CAPACITY:
          queue = busCapacityQueue;
          break;
        case QueueName.NOTIFICATIONS:
          queue = notificationsQueue;
          break;
        default:
          return ResponseUtil.errorResponse(
            res,
            STATUS_CODES.BAD_REQUEST,
            'Invalid queue name'
          );
      }

      const job = await queue.getJob(jobId);
      if (!job) {
        return ResponseUtil.errorResponse(
          res,
          STATUS_CODES.NOT_FOUND,
          'Job not found'
        );
      }

      await job.retry();

      return ResponseUtil.successResponse(
        res,
        STATUS_CODES.SUCCESS,
        {},
        'Job retried successfully'
      );
    } catch (err: any) {
      console.error('Error retrying job:', err);
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.INTERNAL_SERVER_ERROR,
        err.message
      );
    }
  }

  /**
   * Clean queue (remove old jobs)
   * DELETE /api/admin/queues/:queueName/clean
   */
  async cleanQueue(req: CustomRequest, res: Response) {
    try {
      const { queueName } = req.params;
      const { grace = 3600000, status = 'completed', limit = 1000 } = req.body;

      let queue;
      switch (queueName) {
        case QueueName.TRIP_REMINDERS:
          queue = tripRemindersQueue;
          break;
        case QueueName.BUS_CAPACITY:
          queue = busCapacityQueue;
          break;
        case QueueName.NOTIFICATIONS:
          queue = notificationsQueue;
          break;
        default:
          return ResponseUtil.errorResponse(
            res,
            STATUS_CODES.BAD_REQUEST,
            'Invalid queue name'
          );
      }

      const removed = await queue.clean(grace, limit, status);

      return ResponseUtil.successResponse(
        res,
        STATUS_CODES.SUCCESS,
        { removed: removed.length },
        `Cleaned ${removed.length} jobs from queue`
      );
    } catch (err: any) {
      console.error('Error cleaning queue:', err);
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.INTERNAL_SERVER_ERROR,
        err.message
      );
    }
  }

  /**
   * Pause queue
   * POST /api/admin/queues/:queueName/pause
   */
  async pauseQueue(req: CustomRequest, res: Response) {
    try {
      const { queueName } = req.params;

      let queue;
      switch (queueName) {
        case QueueName.TRIP_REMINDERS:
          queue = tripRemindersQueue;
          break;
        case QueueName.BUS_CAPACITY:
          queue = busCapacityQueue;
          break;
        case QueueName.NOTIFICATIONS:
          queue = notificationsQueue;
          break;
        default:
          return ResponseUtil.errorResponse(
            res,
            STATUS_CODES.BAD_REQUEST,
            'Invalid queue name'
          );
      }

      await queue.pause();

      return ResponseUtil.successResponse(
        res,
        STATUS_CODES.SUCCESS,
        {},
        'Queue paused successfully'
      );
    } catch (err: any) {
      console.error('Error pausing queue:', err);
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.INTERNAL_SERVER_ERROR,
        err.message
      );
    }
  }

  /**
   * Resume queue
   * POST /api/admin/queues/:queueName/resume
   */
  async resumeQueue(req: CustomRequest, res: Response) {
    try {
      const { queueName } = req.params;

      let queue;
      switch (queueName) {
        case QueueName.TRIP_REMINDERS:
          queue = tripRemindersQueue;
          break;
        case QueueName.BUS_CAPACITY:
          queue = busCapacityQueue;
          break;
        case QueueName.NOTIFICATIONS:
          queue = notificationsQueue;
          break;
        default:
          return ResponseUtil.errorResponse(
            res,
            STATUS_CODES.BAD_REQUEST,
            'Invalid queue name'
          );
      }

      await queue.resume();

      return ResponseUtil.successResponse(
        res,
        STATUS_CODES.SUCCESS,
        {},
        'Queue resumed successfully'
      );
    } catch (err: any) {
      console.error('Error resuming queue:', err);
      return ResponseUtil.errorResponse(
        res,
        STATUS_CODES.INTERNAL_SERVER_ERROR,
        err.message
      );
    }
  }

  // Helper method to get queue counts
  private async getQueueCounts(queue: any) {
    const [
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused,
    ] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused,
    };
  }
}

export default new QueueController();

