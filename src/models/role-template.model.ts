import { Schema, model, Document } from 'mongoose';
import { ObjectId, UserRole } from './common/types';

// Role template enums
export enum PermissionAction {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  EXPORT = 'export',
  IMPORT = 'import',
  APPROVE = 'approve',
  REJECT = 'reject'
}

export enum PermissionResource {
  USER = 'user',
  BOOKING = 'booking',
  ROUTE = 'route',
  BUS = 'bus',
  DRIVER = 'driver',
  PAYMENT = 'payment',
  REPORT = 'report',
  NOTIFICATION = 'notification',
  SUPPORT_TICKET = 'support_ticket',
  CHAT_SESSION = 'chat_session',
  HELP_ARTICLE = 'help_article',
  EMAIL_TEMPLATE = 'email_template',
  SYSTEM_SETTINGS = 'system_settings'
}

export enum TemplateStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DEPRECATED = 'deprecated'
}

// Interfaces
export interface Permission {
  resource: PermissionResource;
  actions: PermissionAction[];
  conditions?: {
    own?: boolean; // Can only access own resources
    department?: string; // Restricted to specific department
    office?: ObjectId; // Restricted to specific office
    customCondition?: string; // Custom condition expression
  };
}

export interface DepartmentConfig {
  name: string;
  description: string;
  defaultOffice?: ObjectId;
  reportingStructure: {
    reportsTo?: UserRole;
    manages?: UserRole[];
  };
}

export interface IRoleTemplate extends Document {
  name: string;
  description: string;
  role: UserRole;
  permissions: Permission[];
  department: DepartmentConfig;
  isDefault: boolean;
  isSystemRole: boolean; // Cannot be deleted or modified
  status: TemplateStatus;
  metadata: {
    maxUsers?: number; // Maximum users that can have this role
    requiresApproval: boolean; // Role assignment requires approval
    autoExpiry?: {
      enabled: boolean;
      duration: number; // in days
      reminderDays: number[];
    };
  };
  inheritance: {
    inheritsFrom?: ObjectId; // Parent role template
    overrides: Permission[]; // Permissions that override parent
  };
  restrictions: {
    ipWhitelist?: string[]; // IP addresses allowed for this role
    timeRestrictions?: {
      allowedHours: { start: string; end: string }[];
      allowedDays: number[]; // 0-6, Sunday = 0
      timezone: string;
    };
    deviceRestrictions?: {
      allowedDeviceTypes: string[];
      maxConcurrentSessions: number;
    };
  };
  analytics: {
    usageCount: number; // How many users currently have this role
    assignmentHistory: Array<{
      userId: ObjectId;
      assignedBy: ObjectId;
      assignedAt: Date;
      removedAt?: Date;
      removedBy?: ObjectId;
    }>;
  };
  createdBy: ObjectId;
  lastModifiedBy: ObjectId;
  approvedBy?: ObjectId;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Role Template Schema
const RoleTemplateSchema = new Schema<IRoleTemplate>({
  name: { 
    type: String, 
    required: true,
    maxlength: 100,
    index: true
  },
  description: { 
    type: String, 
    maxlength: 500 
  },
  role: { 
    type: String, 
    enum: Object.values(UserRole), 
    required: true,
    index: true
  },
  permissions: [{
    resource: { 
      type: String, 
      enum: Object.values(PermissionResource), 
      required: true 
    },
    actions: [{ 
      type: String, 
      enum: Object.values(PermissionAction), 
      required: true 
    }],
    conditions: {
      own: { type: Boolean, default: false },
      department: String,
      office: { type: Schema.Types.ObjectId, ref: 'Office' },
      customCondition: String
    }
  }],
  department: {
    name: { type: String, required: true },
    description: String,
    defaultOffice: { type: Schema.Types.ObjectId, ref: 'Office' },
    reportingStructure: {
      reportsTo: { type: String, enum: Object.values(UserRole) },
      manages: [{ type: String, enum: Object.values(UserRole) }]
    }
  },
  isDefault: { 
    type: Boolean, 
    default: false,
    index: true
  },
  isSystemRole: { 
    type: Boolean, 
    default: false 
  },
  status: { 
    type: String, 
    enum: Object.values(TemplateStatus), 
    default: TemplateStatus.ACTIVE,
    index: true
  },
  metadata: {
    maxUsers: { type: Number, min: 1 },
    requiresApproval: { type: Boolean, default: false },
    autoExpiry: {
      enabled: { type: Boolean, default: false },
      duration: { type: Number, min: 1 }, // days
      reminderDays: [{ type: Number, min: 1 }]
    }
  },
  inheritance: {
    inheritsFrom: { type: Schema.Types.ObjectId, ref: 'RoleTemplate' },
    overrides: [{
      resource: { 
        type: String, 
        enum: Object.values(PermissionResource), 
        required: true 
      },
      actions: [{ 
        type: String, 
        enum: Object.values(PermissionAction), 
        required: true 
      }],
      conditions: {
        own: Boolean,
        department: String,
        office: { type: Schema.Types.ObjectId, ref: 'Office' },
        customCondition: String
      }
    }]
  },
  restrictions: {
    ipWhitelist: [String],
    timeRestrictions: {
      allowedHours: [{
        start: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
        end: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ }
      }],
      allowedDays: [{ type: Number, min: 0, max: 6 }],
      timezone: { type: String, default: 'UTC' }
    },
    deviceRestrictions: {
      allowedDeviceTypes: [String],
      maxConcurrentSessions: { type: Number, min: 1, default: 5 }
    }
  },
  analytics: {
    usageCount: { type: Number, default: 0 },
    assignmentHistory: [{
      userId: { type: Schema.Types.ObjectId, ref: 'Auth', required: true },
      assignedBy: { type: Schema.Types.ObjectId, ref: 'Auth', required: true },
      assignedAt: { type: Date, default: Date.now },
      removedAt: Date,
      removedBy: { type: Schema.Types.ObjectId, ref: 'Auth' }
    }]
  },
  createdBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'Auth', 
    required: true,
    index: true
  },
  lastModifiedBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'Auth',
    index: true
  },
  approvedBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'Auth' 
  },
  approvedAt: Date
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
RoleTemplateSchema.index({ role: 1, status: 1 });
RoleTemplateSchema.index({ 'department.name': 1 });
RoleTemplateSchema.index({ isDefault: 1, status: 1 });
RoleTemplateSchema.index({ createdBy: 1, createdAt: -1 });
RoleTemplateSchema.index({ 'analytics.usageCount': -1 });

// Virtual for effective permissions (including inherited)
RoleTemplateSchema.virtual('effectivePermissions').get(function() {
  // This would need to be populated to work properly with inheritance
  return this.permissions;
});

// Virtual for active assignments
RoleTemplateSchema.virtual('activeAssignments').get(function() {
  return this.analytics.assignmentHistory.filter(assignment => !assignment.removedAt);
});

// Method to check if user has permission
RoleTemplateSchema.methods.hasPermission = function(
  resource: PermissionResource, 
  action: PermissionAction,
  context?: any
): boolean {
  const permission = this.permissions.find((p: any) => p.resource === resource);
  if (!permission || !permission.actions.includes(action)) {
    return false;
  }
  
  // Check conditions if provided
  if (permission.conditions && context) {
    if (permission.conditions.own && context.ownerId !== context.userId) {
      return false;
    }
    
    if (permission.conditions.department && context.userDepartment !== permission.conditions.department) {
      return false;
    }
    
    if (permission.conditions.office && context.userOffice !== permission.conditions.office.toString()) {
      return false;
    }
  }
  
  return true;
};

// Method to add permission
RoleTemplateSchema.methods.addPermission = function(
  resource: PermissionResource,
  actions: PermissionAction[],
  conditions?: any
) {
  const existingPermission = this.permissions.find((p: any) => p.resource === resource);
  
  if (existingPermission) {
    // Merge actions
    const newActions = [...new Set([...existingPermission.actions, ...actions])];
    existingPermission.actions = newActions;
    if (conditions) {
      existingPermission.conditions = { ...existingPermission.conditions, ...conditions };
    }
  } else {
    this.permissions.push({
      resource,
      actions,
      conditions
    });
  }
  
  return this.save();
};

// Method to remove permission
RoleTemplateSchema.methods.removePermission = function(
  resource: PermissionResource,
  actions?: PermissionAction[]
) {
  if (actions) {
    const permission = this.permissions.find((p: any) => p.resource === resource);
    if (permission) {
      permission.actions = permission.actions.filter((action: any) => !actions.includes(action));
      if (permission.actions.length === 0) {
        this.permissions = this.permissions.filter((p: any) => p.resource !== resource);
      }
    }
  } else {
    this.permissions = this.permissions.filter((p: any) => p.resource !== resource);
  }
  
  return this.save();
};

// Method to record assignment
RoleTemplateSchema.methods.recordAssignment = function(
  userId: ObjectId,
  assignedBy: ObjectId
) {
  this.analytics.assignmentHistory.push({
    userId,
    assignedBy,
    assignedAt: new Date()
  });
  
  this.analytics.usageCount += 1;
  
  return this.save();
};

// Method to record removal
RoleTemplateSchema.methods.recordRemoval = function(
  userId: ObjectId,
  removedBy: ObjectId
) {
  const assignment = this.analytics.assignmentHistory.find(
    (a: any) => a.userId.toString() === userId.toString() && !a.removedAt
  );
  
  if (assignment) {
    assignment.removedAt = new Date();
    assignment.removedBy = removedBy;
    this.analytics.usageCount = Math.max(0, this.analytics.usageCount - 1);
  }
  
  return this.save();
};

// Static method to get default template for role
RoleTemplateSchema.statics.getDefaultForRole = function(role: UserRole) {
  return this.findOne({ role, isDefault: true, status: TemplateStatus.ACTIVE });
};

// Static method to get templates by department
RoleTemplateSchema.statics.getByDepartment = function(departmentName: string) {
  return this.find({ 
    'department.name': departmentName, 
    status: TemplateStatus.ACTIVE 
  }).sort({ name: 1 });
};

export default model<IRoleTemplate>('RoleTemplate', RoleTemplateSchema);