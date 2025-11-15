import { Schema, model, Document } from 'mongoose';
import { commonOptions } from './common/options';

// Define all possible modules in the system
export enum PermissionModule {
  DASHBOARD = 'dashboard',
  TICKETS = 'tickets',
  AGENTS = 'agents',
  BUSES = 'buses',
  DRIVERS = 'drivers',
  DESTINATIONS = 'destinations',
  ROUTES = 'routes',
  SALES_OFFICE = 'sales_office',
  REPORTS = 'reports',
  SETTINGS = 'settings',
  USERS = 'users',
  PERMISSIONS = 'permissions',
}

// Define all possible actions
export enum PermissionAction {
  VIEW = 'view',
  CREATE = 'create',
  EDIT = 'edit',
  DELETE = 'delete',
  PRINT = 'print',
  EXPORT = 'export',
}

// Interface definition
export interface IPermission extends Document {
  module: PermissionModule;
  action: PermissionAction;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Schema definition
const PermissionSchema = new Schema<IPermission>({
  module: {
    type: String,
    required: true,
    enum: Object.values(PermissionModule),
    index: true,
  },
  action: {
    type: String,
    required: true,
    enum: Object.values(PermissionAction),
  },
  description: {
    type: String,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, commonOptions);

// Compound index to ensure unique module-action combinations
PermissionSchema.index({ module: 1, action: 1 }, { unique: true });

// Model export
const Permission = model<IPermission>('Permission', PermissionSchema);
export default Permission;

