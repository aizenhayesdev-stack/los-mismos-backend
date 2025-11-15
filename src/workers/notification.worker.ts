import { Worker, Job } from 'bullmq';
import { bullMQConnection, JobName, QueueName } from '../config/bullmq';
import notificationService from '../services/notification.service';

// Worker for processing notification jobs
export const notificationWorker = new Worker(
  QueueName.NOTIFICATIONS,
  async (job: Job) => {
    console.log(`📬 Processing notification job: ${job.name} (ID: ${job.id})`);

    try {
      switch (job.name) {
        case JobName.PROCESS_SCHEDULED_NOTIFICATIONS:
          await notificationService.processScheduledNotifications();
          console.log('✅ Scheduled notifications processed successfully');
          break;

        case JobName.SEND_NOTIFICATION:
          // Handle individual notification sending if needed
          const { userId, options } = job.data;
          // Convert Date strings back to Date objects if needed
          const processedOptions = {
            ...options,
            scheduledFor: options.scheduledFor 
              ? (options.scheduledFor instanceof Date ? options.scheduledFor : new Date(options.scheduledFor))
              : undefined,
            expiresAt: options.expiresAt 
              ? (options.expiresAt instanceof Date ? options.expiresAt : new Date(options.expiresAt))
              : undefined,
          };
          await notificationService.sendToUser({
            userId,
            ...processedOptions,
          });
          console.log(`✅ Notification sent to user ${userId}`);
          break;

        case JobName.SEND_BOOKING_CONFIRMATION:
          const { userId: bookingUserId, bookingData } = job.data;
          // Convert departureTime back to Date if it's a string
          const processedBookingData = {
            ...bookingData,
            departureTime: bookingData.departureTime instanceof Date 
              ? bookingData.departureTime 
              : new Date(bookingData.departureTime)
          };
          await notificationService.sendBookingConfirmation(bookingUserId, processedBookingData);
          console.log(`✅ Booking confirmation sent to user ${bookingUserId}`);
          break;

        case JobName.SEND_PAYMENT_RECEIPT:
          const { userId: receiptUserId, paymentData } = job.data;
          await notificationService.sendPaymentReceipt(receiptUserId, paymentData);
          console.log(`✅ Payment receipt sent to user ${receiptUserId}`);
          break;

        default:
          console.warn(`⚠️  Unknown notification job: ${job.name}`);
      }
    } catch (error: any) {
      console.error(`❌ Error processing notification job ${job.name}:`, error);
      throw error; // Throw to trigger retry
    }
  },
  {
    connection: bullMQConnection,
    concurrency: 5, // Process up to 5 notification jobs concurrently
    limiter: {
      max: 10, // Maximum 10 jobs
      duration: 1000, // per second
    },
  }
);

// Worker event listeners
notificationWorker.on('completed', (job: Job) => {
  console.log(`✅ Notification job ${job.id} completed`);
});

notificationWorker.on('failed', (job: Job | undefined, err: Error) => {
  console.error(`❌ Notification job ${job?.id} failed:`, err.message);
});

notificationWorker.on('error', (err: Error) => {
  console.error('❌ Notification worker error:', err);
});

export default notificationWorker;

