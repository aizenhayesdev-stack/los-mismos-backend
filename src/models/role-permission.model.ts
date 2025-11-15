import { Schema, model, Document } from 'mongoose';
import { commonOptions } from './common/options';
import { ObjectId, UserRole } from './common/types';

// Interface for individual permission entry
export interface IRolePermissionEntry {
  module: string;
  actions: string[]; // Array of action strings like ['view', 'create', 'edit', 'delete']
}

// Interface definition
export interface IRolePermission extends Document {
  role: UserRole;
  permissions: IRolePermissionEntry[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Schema definition
const RolePermissionSchema = new Schema<IRolePermission>({
  role: {
    type: String,
    required: true,
    enum: Object.values(UserRole),
    unique: true, // Each role can have only one permission document
    index: true,
  },
  permissions: [{
    module: {
      type: String,
      required: true,
    },
    actions: [{
      type: String,
      required: true,
    }],
    _id: false, // Disable _id for subdocuments
  }],
  isActive: {
    type: Boolean,
    default: true,
  },
}, commonOptions);

// Model export
const RolePermission = model<IRolePermission>('RolePermission', RolePermissionSchema);
export default RolePermission;

