import { Schema, model, Document } from 'mongoose';
import { ObjectId, UserRole } from './common/types';

// User management enums
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  SUSPEND = 'suspend',
  ACTIVATE = 'activate',
  DELETE = 'delete',
  BULK_IMPORT = 'bulk_import',
  BULK_UPDATE = 'bulk_update',
  ROLE_CHANGE = 'role_change',
  PASSWORD_RESET = 'password_reset'
}

export enum OperationStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum AuditAction {
  LOGIN = 'login',
  LOGOUT = 'logout',
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  EXPORT = 'export',
  IMPORT = 'import',
  PERMISSION_CHANGE = 'permission_change',
  ROLE_CHANGE = 'role_change',
  SUSPEND = 'suspend',
  ACTIVATE = 'activate'
}

// Interfaces
export interface UserChangeRecord {
  field: string;
  oldValue: any;
  newValue: any;
  timestamp: Date;
}

export interface AuditEntry {
  action: AuditAction;
  performedBy: ObjectId;
  targetUser?: ObjectId;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export interface BulkOperationResult {
  totalProcessed: number;
  successful: number;
  failed: number;
  errors: Array<{
    userId?: ObjectId;
    email?: string;
    error: string;
  }>;
}

export interface IUserManagementOperation extends Document {
  operationType: OperationType;
  targetUsers: ObjectId[];
  performedBy: ObjectId;
  changes: UserChangeRecord[];
  reason: string;
  status: OperationStatus;
  result?: BulkOperationResult;
  metadata: {
    source: 'admin_panel' | 'api' | 'bulk_import' | 'scheduled';
    batchId?: string;
    csvFile?: string;
    totalRecords?: number;
  };
  scheduledFor?: Date;
  startedAt?: Date;
  completedAt?: Date;
  auditTrail: AuditEntry[];
  createdAt: Date;
  updatedAt: Date;
}

// User Management Operation Schema
const UserManagementOperationSchema = new Schema<IUserManagementOperation>({
  operationType: { 
    type: String, 
    enum: Object.values(OperationType), 
    required: true,
    index: true
  },
  targetUsers: [{ 
    type: Schema.Types.ObjectId, 
    ref: 'Auth',
    index: true
  }],
  performedBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'Auth', 
    required: true,
    index: true
  },
  changes: [{
    field: { type: String, required: true },
    oldValue: Schema.Types.Mixed,
    newValue: Schema.Types.Mixed,
    timestamp: { type: Date, default: Date.now }
  }],
  reason: { 
    type: String, 
    required: true,
    maxlength: 500
  },
  status: { 
    type: String, 
    enum: Object.values(OperationStatus), 
    default: OperationStatus.PENDING,
    index: true
  },
  result: {
    totalProcessed: { type: Number, default: 0 },
    successful: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    errors: [{
      userId: { type: Schema.Types.ObjectId, ref: 'Auth' },
      email: String,
      error: String
    }]
  },
  metadata: {
    source: { 
      type: String, 
      enum: ['admin_panel', 'api', 'bulk_import', 'scheduled'],
      default: 'admin_panel'
    },
    batchId: String,
    csvFile: String,
    totalRecords: Number
  },
  scheduledFor: Date,
  startedAt: Date,
  completedAt: Date,
  auditTrail: [{
    action: { 
      type: String, 
      enum: Object.values(AuditAction), 
      required: true 
    },
    performedBy: { 
      type: Schema.Types.ObjectId, 
      ref: 'Auth', 
      required: true 
    },
    targetUser: { 
      type: Schema.Types.ObjectId, 
      ref: 'Auth' 
    },
    details: { type: Schema.Types.Mixed, default: {} },
    ipAddress: String,
    userAgent: String,
    timestamp: { type: Date, default: Date.now }
  }]
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
UserManagementOperationSchema.index({ performedBy: 1, createdAt: -1 });
UserManagementOperationSchema.index({ status: 1, scheduledFor: 1 });
UserManagementOperationSchema.index({ operationType: 1, createdAt: -1 });
UserManagementOperationSchema.index({ 'targetUsers': 1 });
UserManagementOperationSchema.index({ 'metadata.batchId': 1 });

// Virtual for duration
UserManagementOperationSchema.virtual('duration').get(function() {
  if (this.startedAt && this.completedAt) {
    return this.completedAt.getTime() - this.startedAt.getTime();
  }
  return null;
});

// Virtual for success rate
UserManagementOperationSchema.virtual('successRate').get(function() {
  if (!this.result || this.result.totalProcessed === 0) return 0;
  return (this.result.successful / this.result.totalProcessed) * 100;
});

// Method to add audit entry
UserManagementOperationSchema.methods.addAuditEntry = function(
  action: AuditAction,
  performedBy: ObjectId,
  details: Record<string, any> = {},
  targetUser?: ObjectId,
  ipAddress?: string,
  userAgent?: string
) {
  this.auditTrail.push({
    action,
    performedBy,
    targetUser,
    details,
    ipAddress,
    userAgent,
    timestamp: new Date()
  });
  
  return this.save();
};

// Method to update status
UserManagementOperationSchema.methods.updateStatus = function(
  status: OperationStatus,
  result?: Partial<BulkOperationResult>
) {
  this.status = status;
  
  if (status === OperationStatus.IN_PROGRESS && !this.startedAt) {
    this.startedAt = new Date();
  }
  
  if ([OperationStatus.COMPLETED, OperationStatus.FAILED, OperationStatus.CANCELLED].includes(status)) {
    this.completedAt = new Date();
  }
  
  if (result) {
    this.result = { ...this.result, ...result };
  }
  
  return this.save();
};

export default model<IUserManagementOperation>('UserManagementOperation', UserManagementOperationSchema);