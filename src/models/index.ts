// Barrel export file for Los Mismos Tours Mongoose models
// Maintains backward compatibility with existing import syntax
// Note: These are separate from the existing auth/profile models in this project

// import User from './user.model';
// import Trip from './trip.model';
// import Booking from './booking.model';
// import Ticket from './ticket.model';
// import Maintenance from './maintenance.model';
// import AuditLog from './audit-log.model';
// import Stop from './stop.model';
import Profile from './profile.model';
import Office from './office.model';
import Bus from './bus.model';
import Route from './route.model';
import SeatHold from './seat-hold.model';
import PaymentTransaction from './payment-transaction.model';
import Notification from './notification.model';
import Device from './device.model';
import DriverReport from './driver-report.model';

// Export individual models
export {
  // User,
  Profile,
  Office,
  Bus,
  Route,
  SeatHold,
  PaymentTransaction,
  Notification,
  Device,
  DriverReport
};

// Export interfaces for TypeScript usage
// export type { IUser } from './user.model';
// export type { IStop } from './stop.model';
// export type { IBooking } from './booking.model';
// export type { ITicket } from './ticket.model';
// export type { IAuditLog } from './audit-log.model';
// export type { ITrip } from './trip.model';
// export type { IMaintenance } from './maintenance.model';
export type { IProfile } from './profile.model';
export type { IOffice } from './office.model';
export type { IBus } from './bus.model';
export type { IRoute } from './route.model';
export type { ISeatHold } from './seat-hold.model';
export type { IPaymentTransaction } from './payment-transaction.model';
export type { INotification } from './notification.model';
export type { IDevice } from './device.model';
export type { IDriverReport } from './driver-report.model';

// Export common types and enums
export * from './common/types';
export { commonOptions } from './common/options';

// Default export - models object for backward compatibility
const models = {
  // User,
  // Stop,
  // Trip,
  // Booking,
  // Ticket,
  // Maintenance,
  // AuditLog,
  Profile,
  Office,
  Bus,
  Route,
  SeatHold,
  PaymentTransaction,
  Notification,
  Device,
  DriverReport
};

export default models;