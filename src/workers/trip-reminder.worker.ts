import { Worker, Job } from 'bullmq';
import { bullMQConnection, JobName, QueueName } from '../config/bullmq';
import tripReminderService from '../services/trip-reminder.service';

// Worker for processing trip reminder jobs
export const tripReminderWorker = new Worker(
  QueueName.TRIP_REMINDERS,
  async (job: Job) => {
    console.log(`⏰ Processing trip reminder job: ${job.name} (ID: ${job.id})`);

    try {
      switch (job.name) {
        case JobName.CHECK_TRIP_REMINDERS:
          await tripReminderService.checkAndSendReminders();
          console.log('✅ Trip reminders check completed successfully');
          break;

        default:
          console.warn(`⚠️  Unknown trip reminder job: ${job.name}`);
      }
    } catch (error: any) {
      console.error(`❌ Error processing trip reminder job ${job.name}:`, error);
      throw error; // Throw to trigger retry
    }
  },
  {
    connection: bullMQConnection,
    concurrency: 1, // Process one at a time to avoid race conditions
    limiter: {
      max: 1, // Maximum 1 job
      duration: 60000, // per minute (prevents multiple simultaneous checks)
    },
  }
);

// Worker event listeners
tripReminderWorker.on('completed', (job: Job) => {
  console.log(`✅ Trip reminder job ${job.id} completed`);
});

tripReminderWorker.on('failed', (job: Job | undefined, err: Error) => {
  console.error(`❌ Trip reminder job ${job?.id} failed:`, err.message);
});

tripReminderWorker.on('error', (err: Error) => {
  console.error('❌ Trip reminder worker error:', err);
});

export default tripReminderWorker;

