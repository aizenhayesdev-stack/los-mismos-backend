import tripReminderWorker from './trip-reminder.worker';
import busCapacityWorker from './bus-capacity.worker';
import notificationWorker from './notification.worker';

// Export all workers
export const workers = {
  tripReminderWorker,
  busCapacityWorker,
  notificationWorker,
};

// Initialize all workers
export async function initializeWorkers() {
  console.log('🚀 Initializing BullMQ workers...');
  
  // Workers are already initialized when imported
  console.log('✅ BullMQ workers initialized:');
  console.log('   - Trip Reminder Worker');
  console.log('   - Bus Capacity Worker');
  console.log('   - Notification Worker');
}

// Graceful shutdown of all workers
export async function shutdownWorkers() {
  console.log('🔄 Shutting down BullMQ workers...');
  
  await Promise.all([
    tripReminderWorker.close(),
    busCapacityWorker.close(),
    notificationWorker.close(),
  ]);
  
  console.log('✅ All BullMQ workers shut down successfully');
}

export default {
  workers,
  initializeWorkers,
  shutdownWorkers,
};

