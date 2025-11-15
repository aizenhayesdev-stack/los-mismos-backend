/**
 * Seed script to initialize default permissions
 * Run this script to set up permissions when first deploying the application
 * 
 * Usage: npx ts-node src/scripts/seed-permissions.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Permission, { PermissionModule, PermissionAction } from '../models/permission.model';
import RolePermission from '../models/role-permission.model';
import { UserRole } from '../models/common/types';
import { DB_URI } from '../config/environment';

dotenv.config();

// Define all permission combinations
const permissionDefinitions = [
  // Dashboard
  { module: PermissionModule.DASHBOARD, action: PermissionAction.VIEW, description: 'View dashboard' },
  { module: PermissionModule.DASHBOARD, action: PermissionAction.EDIT, description: 'Edit dashboard settings' },
  { module: PermissionModule.DASHBOARD, action: PermissionAction.DELETE, description: 'Delete dashboard items' },
  
  // Tickets
  { module: PermissionModule.TICKETS, action: PermissionAction.VIEW, description: 'View tickets' },
  { module: PermissionModule.TICKETS, action: PermissionAction.CREATE, description: 'Create tickets' },
  { module: PermissionModule.TICKETS, action: PermissionAction.EDIT, description: 'Edit tickets' },
  { module: PermissionModule.TICKETS, action: PermissionAction.DELETE, description: 'Delete tickets' },
  { module: PermissionModule.TICKETS, action: PermissionAction.PRINT, description: 'Print tickets' },
  
  // Agents
  { module: PermissionModule.AGENTS, action: PermissionAction.VIEW, description: 'View agents' },
  { module: PermissionModule.AGENTS, action: PermissionAction.CREATE, description: 'Create agents' },
  { module: PermissionModule.AGENTS, action: PermissionAction.EDIT, description: 'Edit agents' },
  { module: PermissionModule.AGENTS, action: PermissionAction.DELETE, description: 'Delete agents' },
  
  // Buses
  { module: PermissionModule.BUSES, action: PermissionAction.VIEW, description: 'View buses' },
  { module: PermissionModule.BUSES, action: PermissionAction.CREATE, description: 'Create buses' },
  { module: PermissionModule.BUSES, action: PermissionAction.EDIT, description: 'Edit buses' },
  { module: PermissionModule.BUSES, action: PermissionAction.DELETE, description: 'Delete buses' },
  
  // Drivers
  { module: PermissionModule.DRIVERS, action: PermissionAction.VIEW, description: 'View drivers' },
  { module: PermissionModule.DRIVERS, action: PermissionAction.CREATE, description: 'Create drivers' },
  { module: PermissionModule.DRIVERS, action: PermissionAction.EDIT, description: 'Edit drivers' },
  { module: PermissionModule.DRIVERS, action: PermissionAction.DELETE, description: 'Delete drivers' },
  
  // Destinations
  { module: PermissionModule.DESTINATIONS, action: PermissionAction.VIEW, description: 'View destinations' },
  { module: PermissionModule.DESTINATIONS, action: PermissionAction.CREATE, description: 'Create destinations' },
  { module: PermissionModule.DESTINATIONS, action: PermissionAction.EDIT, description: 'Edit destinations' },
  { module: PermissionModule.DESTINATIONS, action: PermissionAction.DELETE, description: 'Delete destinations' },
  
  // Routes
  { module: PermissionModule.ROUTES, action: PermissionAction.VIEW, description: 'View routes' },
  { module: PermissionModule.ROUTES, action: PermissionAction.CREATE, description: 'Create routes' },
  { module: PermissionModule.ROUTES, action: PermissionAction.EDIT, description: 'Edit routes' },
  { module: PermissionModule.ROUTES, action: PermissionAction.DELETE, description: 'Delete routes' },
  
  // Sales Office
  { module: PermissionModule.SALES_OFFICE, action: PermissionAction.VIEW, description: 'View sales offices' },
  { module: PermissionModule.SALES_OFFICE, action: PermissionAction.CREATE, description: 'Create sales offices' },
  { module: PermissionModule.SALES_OFFICE, action: PermissionAction.EDIT, description: 'Edit sales offices' },
  { module: PermissionModule.SALES_OFFICE, action: PermissionAction.DELETE, description: 'Delete sales offices' },
  
  // Reports
  { module: PermissionModule.REPORTS, action: PermissionAction.VIEW, description: 'View reports' },
  { module: PermissionModule.REPORTS, action: PermissionAction.EXPORT, description: 'Export reports' },
  { module: PermissionModule.REPORTS, action: PermissionAction.PRINT, description: 'Print reports' },
  
  // Settings
  { module: PermissionModule.SETTINGS, action: PermissionAction.VIEW, description: 'View settings' },
  { module: PermissionModule.SETTINGS, action: PermissionAction.EDIT, description: 'Edit settings' },
  
  // Users
  { module: PermissionModule.USERS, action: PermissionAction.VIEW, description: 'View users' },
  { module: PermissionModule.USERS, action: PermissionAction.CREATE, description: 'Create users' },
  { module: PermissionModule.USERS, action: PermissionAction.EDIT, description: 'Edit users' },
  { module: PermissionModule.USERS, action: PermissionAction.DELETE, description: 'Delete users' },
  
  // Permissions
  { module: PermissionModule.PERMISSIONS, action: PermissionAction.VIEW, description: 'View permissions' },
  { module: PermissionModule.PERMISSIONS, action: PermissionAction.EDIT, description: 'Edit permissions' },
];

// Default role permissions - Carefully designed for a ticketing/transportation system
const defaultRolePermissions = {
  // ==================== SUPER ADMIN ====================
  // Full system access - can do everything
  [UserRole.SUPER_ADMIN]: {
    permissions: Object.values(PermissionModule).map(module => {
      const actions = permissionDefinitions
        .filter(p => p.module === module)
        .map(p => p.action);
      return { module, actions };
    })
  },

  // ==================== MANAGER ====================
  // Supervisory role - can manage operations, view everything, 
  // create/edit most resources, access all reports
  [UserRole.MANAGER]: {
    permissions: [
      // Full dashboard access for monitoring
      { module: PermissionModule.DASHBOARD, actions: [PermissionAction.VIEW, PermissionAction.EDIT] },
      
      // Full ticket management capabilities
      { module: PermissionModule.TICKETS, actions: [
        PermissionAction.VIEW, 
        PermissionAction.CREATE, 
        PermissionAction.EDIT, 
        PermissionAction.DELETE,
        PermissionAction.PRINT
      ]},
      
      // Can manage agents/staff (cashiers, drivers)
      { module: PermissionModule.AGENTS, actions: [
        PermissionAction.VIEW, 
        PermissionAction.CREATE, 
        PermissionAction.EDIT
      ]},
      
      // Can view and edit buses (but not delete to prevent data loss)
      { module: PermissionModule.BUSES, actions: [
        PermissionAction.VIEW, 
        PermissionAction.CREATE, 
        PermissionAction.EDIT
      ]},
      
      // Can manage drivers
      { module: PermissionModule.DRIVERS, actions: [
        PermissionAction.VIEW, 
        PermissionAction.CREATE, 
        PermissionAction.EDIT
      ]},
      
      // Can manage destinations
      { module: PermissionModule.DESTINATIONS, actions: [
        PermissionAction.VIEW, 
        PermissionAction.CREATE, 
        PermissionAction.EDIT
      ]},
      
      // Can manage routes
      { module: PermissionModule.ROUTES, actions: [
        PermissionAction.VIEW, 
        PermissionAction.CREATE, 
        PermissionAction.EDIT
      ]},
      
      // Can manage sales offices
      { module: PermissionModule.SALES_OFFICE, actions: [
        PermissionAction.VIEW, 
        PermissionAction.CREATE, 
        PermissionAction.EDIT
      ]},
      
      // Full access to reports for business intelligence
      { module: PermissionModule.REPORTS, actions: [
        PermissionAction.VIEW, 
        PermissionAction.EXPORT, 
        PermissionAction.PRINT
      ]},
      
      // Can view and edit most settings
      { module: PermissionModule.SETTINGS, actions: [
        PermissionAction.VIEW, 
        PermissionAction.EDIT
      ]},
      
      // Can view and manage users
      { module: PermissionModule.USERS, actions: [
        PermissionAction.VIEW, 
        PermissionAction.CREATE, 
        PermissionAction.EDIT
      ]},
      
      // Can view permissions but not edit (only super admin can edit)
      { module: PermissionModule.PERMISSIONS, actions: [PermissionAction.VIEW] },
    ]
  },

  // ==================== CASHIER ====================
  // Sales/booking role - focused on ticket sales and customer service
  // Can create bookings, print tickets, view necessary info
  [UserRole.CASHIER]: {
    permissions: [
      // Limited dashboard for daily operations
      { module: PermissionModule.DASHBOARD, actions: [PermissionAction.VIEW] },
      
      // Core responsibility: ticket sales and management
      { module: PermissionModule.TICKETS, actions: [
        PermissionAction.VIEW, 
        PermissionAction.CREATE, 
        PermissionAction.EDIT,  // Can modify bookings before departure
        PermissionAction.PRINT
      ]},
      
      // Need to view buses for seat selection
      { module: PermissionModule.BUSES, actions: [PermissionAction.VIEW] },
      
      // Need to know destinations for booking
      { module: PermissionModule.DESTINATIONS, actions: [PermissionAction.VIEW] },
      
      // Need to know routes and schedules for booking
      { module: PermissionModule.ROUTES, actions: [PermissionAction.VIEW] },
      
      // Can view their own sales office info
      { module: PermissionModule.SALES_OFFICE, actions: [PermissionAction.VIEW] },
      
      // Can view sales reports (their own performance)
      { module: PermissionModule.REPORTS, actions: [
        PermissionAction.VIEW, 
        PermissionAction.PRINT
      ]},
      
      // Can view basic settings (prices, policies)
      { module: PermissionModule.SETTINGS, actions: [PermissionAction.VIEW] },
      
      // Can view customer information
      { module: PermissionModule.USERS, actions: [PermissionAction.VIEW] },
    ]
  },

  // ==================== DRIVER ====================
  // Operational role - focused on trip execution and ticket verification
  // Very limited access, mainly for scanning tickets
  [UserRole.DRIVER]: {
    permissions: [
      // Basic dashboard to see their trips
      { module: PermissionModule.DASHBOARD, actions: [PermissionAction.VIEW] },
      
      // Can view and verify tickets (scan QR codes)
      { module: PermissionModule.TICKETS, actions: [PermissionAction.VIEW] },
      
      // Can view bus details for their assigned vehicle
      { module: PermissionModule.BUSES, actions: [PermissionAction.VIEW] },
      
      // Can view route information for their trips
      { module: PermissionModule.ROUTES, actions: [PermissionAction.VIEW] },
      
      // Can view passenger list
      { module: PermissionModule.USERS, actions: [PermissionAction.VIEW] },
    ]
  },

  // ==================== CUSTOMER ====================
  // End user role - very limited, only their own data
  // Can view and print their own tickets
  [UserRole.CUSTOMER]: {
    permissions: [
      // Can view and print their own tickets only
      { module: PermissionModule.TICKETS, actions: [
        PermissionAction.VIEW, 
        PermissionAction.PRINT
      ]},
      
      // Can view destinations (for browsing/booking on web/app)
      { module: PermissionModule.DESTINATIONS, actions: [PermissionAction.VIEW] },
      
      // Can view available routes (for browsing/booking)
      { module: PermissionModule.ROUTES, actions: [PermissionAction.VIEW] },
      
      // Can view basic settings (terms, policies)
      { module: PermissionModule.SETTINGS, actions: [PermissionAction.VIEW] },
    ]
  },
};

async function seedPermissions() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(DB_URI as string);
    console.log('Connected to MongoDB');

    // Clear existing permissions (optional - comment out if you want to keep existing)
    console.log('\n1. Clearing existing permissions...');
    await Permission.deleteMany({});
    await RolePermission.deleteMany({});
    console.log('   ✓ Cleared existing permissions');

    // Create permissions
    console.log('\n2. Creating permissions...');
    let createdCount = 0;
    for (const perm of permissionDefinitions) {
      const existing = await Permission.findOne({ module: perm.module, action: perm.action });
      if (!existing) {
        await Permission.create(perm);
        createdCount++;
      }
    }
    console.log(`   ✓ Created ${createdCount} permissions`);

    // Create role permissions
    console.log('\n3. Creating role permissions...');
    for (const [role, config] of Object.entries(defaultRolePermissions)) {
      const existing = await RolePermission.findOne({ role });
      if (!existing) {
        await RolePermission.create({
          role,
          permissions: config.permissions,
          isActive: true,
        });
        console.log(`   ✓ Created permissions for ${role}`);
      } else {
        console.log(`   - Permissions for ${role} already exist, skipping...`);
      }
    }

    console.log('\n✅ Permission seeding completed successfully!');
    console.log('\nPermission Summary:');
    console.log(`- Total Permissions: ${permissionDefinitions.length}`);
    console.log(`- Total Roles: ${Object.keys(defaultRolePermissions).length}`);
    console.log('\nAvailable Modules:', Object.values(PermissionModule).join(', '));
    console.log('Available Actions:', Object.values(PermissionAction).join(', '));

  } catch (error) {
    console.error('❌ Error seeding permissions:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
    process.exit(0);
  }
}

// Run the seed function
seedPermissions();

