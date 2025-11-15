import { Queue, QueueOptions, Worker, Job } from 'bullmq';
import { REDIS_HOST, REDIS_PORT, REDIS_URL } from './environment';

// BullMQ connection configuration
export const bullMQConnection = {
//   host: REDIS_HOST || 'localhost',
//   port: parseInt(REDIS_PORT || '6379'),
  url: REDIS_URL,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

// Default queue options
export const defaultQueueOptions: QueueOptions = {
  connection: bullMQConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
};

// Queue names
export enum QueueName {
  TRIP_REMINDERS = 'trip-reminders',
  BUS_CAPACITY = 'bus-capacity',
  NOTIFICATIONS = 'notifications',
}

// Job names
export enum JobName {
  CHECK_TRIP_REMINDERS = 'check-trip-reminders',
  CHECK_BUS_CAPACITY = 'check-bus-capacity',
  CHECK_BUS_CAPACITY_FOR_BOOKING = 'check-bus-capacity-for-booking',
  SEND_NOTIFICATION = 'send-notification',
  PROCESS_SCHEDULED_NOTIFICATIONS = 'process-scheduled-notifications',
  SEND_BOOKING_CONFIRMATION = 'send-booking-confirmation',
  SEND_PAYMENT_RECEIPT = 'send-payment-receipt',
}

// Create queues
export const tripRemindersQueue = new Queue(QueueName.TRIP_REMINDERS, defaultQueueOptions);
export const busCapacityQueue = new Queue(QueueName.BUS_CAPACITY, defaultQueueOptions);
export const notificationsQueue = new Queue(QueueName.NOTIFICATIONS, defaultQueueOptions);

// Helper function to initialize repeatable jobs
export async function initializeRepeatingJobs() {
  try {
    // Clear any existing repeatable jobs to avoid duplicates
    const repeatableJobsTripReminders = await tripRemindersQueue.getRepeatableJobs();
    for (const job of repeatableJobsTripReminders) {
      await tripRemindersQueue.removeRepeatableByKey(job.key);
    }

    const repeatableJobsBusCapacity = await busCapacityQueue.getRepeatableJobs();
    for (const job of repeatableJobsBusCapacity) {
      await busCapacityQueue.removeRepeatableByKey(job.key);
    }

    const repeatableJobsNotifications = await notificationsQueue.getRepeatableJobs();
    for (const job of repeatableJobsNotifications) {
      await notificationsQueue.removeRepeatableByKey(job.key);
    }

    // Add repeatable job for trip reminders (every 5 minutes)
    await tripRemindersQueue.add(
      JobName.CHECK_TRIP_REMINDERS,
      {},
      {
        repeat: {
          pattern: '*/5 * * * *', // Every 5 minutes
        },
        jobId: 'trip-reminders-recurring',
      }
    );

    // Add repeatable job for bus capacity check (every hour)
    await busCapacityQueue.add(
      JobName.CHECK_BUS_CAPACITY,
      {},
      {
        repeat: {
          pattern: '0 * * * *', // Every hour at minute 0
        },
        jobId: 'bus-capacity-recurring',
      }
    );

    // Add repeatable job for scheduled notifications (every minute)
    await notificationsQueue.add(
      JobName.PROCESS_SCHEDULED_NOTIFICATIONS,
      {},
      {
        repeat: {
          pattern: '* * * * *', // Every minute
        },
        jobId: 'scheduled-notifications-recurring',
      }
    );

    console.log('✅ BullMQ repeatable jobs initialized successfully');
    console.log('   - Trip reminders: Every 5 minutes');
    console.log('   - Bus capacity check: Every hour');
    console.log('   - Scheduled notifications: Every minute');
  } catch (error) {
    console.error('❌ Failed to initialize BullMQ repeatable jobs:', error);
    throw error;
  }
}

// Graceful shutdown
export async function shutdownQueues() {
  console.log('🔄 Closing BullMQ queues...');
  await Promise.all([
    tripRemindersQueue.close(),
    busCapacityQueue.close(),
    notificationsQueue.close(),
  ]);
  console.log('✅ BullMQ queues closed');
}

export default {
  tripRemindersQueue,
  busCapacityQueue,
  notificationsQueue,
  initializeRepeatingJobs,
  shutdownQueues,
};

