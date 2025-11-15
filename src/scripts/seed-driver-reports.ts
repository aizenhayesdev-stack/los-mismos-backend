/**
 * Seed script to create sample driver report data using actual database records
 * Run this script to populate driver reports for testing
 * 
 * Usage: npx ts-node src/scripts/seed-driver-reports.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DriverReport from '../models/driver-report.model';
import RouteModel from '../models/route.model';
import BusModel from '../models/bus.model';
import AuthModel from '../models/auth.model';
import DestinationModel from '../models/destinations.model';
import { UserRole } from '../models/common/types';
import { DB_URI } from '../config/environment';

dotenv.config();

// Number of driver reports to create
const NUM_REPORTS = 20;

async function seedDriverReports() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(DB_URI as string);
    console.log('Connected to MongoDB');

    // Fetch actual data from database
    console.log('\n1. Fetching actual data from database...');
    
    const routes = await RouteModel.find({ isActive: true }).limit(10).lean();
    if (routes.length === 0) {
      console.error('❌ No active routes found. Please create routes first.');
      process.exit(1);
    }
    console.log(`   ✓ Found ${routes.length} routes`);

    const buses = await BusModel.find({ isActive: true, isDeleted: false }).limit(10).lean();
    if (buses.length === 0) {
      console.error('❌ No active buses found. Please create buses first.');
      process.exit(1);
    }
    console.log(`   ✓ Found ${buses.length} buses`);

    const drivers = await AuthModel.find({ 
      role: UserRole.DRIVER, 
      isActive: true 
    }).limit(10).lean();
    if (drivers.length === 0) {
      console.error('❌ No drivers found. Please create driver accounts first.');
      process.exit(1);
    }
    console.log(`   ✓ Found ${drivers.length} drivers`);

    const destinations = await DestinationModel.find({ 
      isActive: true, 
      isDeleted: false 
    }).limit(20).lean();
    if (destinations.length === 0) {
      console.error('❌ No destinations found. Please create destinations first.');
      process.exit(1);
    }
    console.log(`   ✓ Found ${destinations.length} destinations`);

    // Clear existing driver reports (optional - comment out if you want to keep existing)
    console.log('\n2. Clearing existing driver reports...');
    const deletedCount = await DriverReport.deleteMany({});
    console.log(`   ✓ Cleared ${deletedCount.deletedCount} existing driver reports`);

    // Generate sample driver reports
    console.log('\n3. Creating sample driver reports...');
    const reports = [];
    const statuses: ('started' | 'completed' | 'cancelled')[] = ['started', 'completed', 'cancelled'];
    
    // Generate dates for the past 2 weeks and next 2 weeks
    const today = new Date();
    const dates: Date[] = [];
    for (let i = -14; i <= 14; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      dates.push(date);
    }

    for (let i = 0; i < NUM_REPORTS; i++) {
      // Randomly select from actual data
      const route = routes[Math.floor(Math.random() * routes.length)];
      const bus = buses[Math.floor(Math.random() * buses.length)];
      
      // Get origin and destination from route or random
      // Handle both ObjectId and populated object cases
      const origin = (route.origin as any)?._id || route.origin || destinations[Math.floor(Math.random() * destinations.length)]._id;
      const destination = (route.destination as any)?._id || route.destination || destinations[Math.floor(Math.random() * destinations.length)]._id;
      
      // Select drivers (some reports may not have both drivers)
      const mxDriver = Math.random() > 0.2 ? drivers[Math.floor(Math.random() * drivers.length)]._id : undefined;
      const usDriver = Math.random() > 0.3 ? drivers[Math.floor(Math.random() * drivers.length)]._id : undefined;
      
      // Random trip date
      const tripDate = dates[Math.floor(Math.random() * dates.length)];
      
      // Get time from route dayTime or generate random time
      let tripTime = '08:00';
      if (route.dayTime && route.dayTime.length > 0) {
        const randomDayTime = route.dayTime[Math.floor(Math.random() * route.dayTime.length)];
        tripTime = randomDayTime.time;
      } else {
        // Generate random time between 6 AM and 10 PM
        const hour = Math.floor(Math.random() * 17) + 6;
        const minute = Math.floor(Math.random() * 4) * 15; // 0, 15, 30, 45
        tripTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      }

      // Random status
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      
      // Generate bus route name (combine origin and destination names)
      const originDest = destinations.find(d => d._id.toString() === origin.toString());
      const destDest = destinations.find(d => d._id.toString() === destination.toString());
      const busRouteName = originDest && destDest 
        ? `${originDest.name} - ${destDest.name}`
        : route.name || 'Unknown Route';

      // Random passenger count (0 to bus capacity or 50)
      const busCapacity = bus.capacity || 50;
      const passengers = Math.floor(Math.random() * (busCapacity + 1));

      // Set startedAt and completedAt based on status
      let startedAt: Date | undefined;
      let completedAt: Date | undefined;
      
      if (status === 'started') {
        startedAt = new Date(tripDate);
        startedAt.setHours(parseInt(tripTime.split(':')[0]), parseInt(tripTime.split(':')[1]), 0, 0);
        // Started within last 2 hours
        startedAt.setHours(startedAt.getHours() - Math.floor(Math.random() * 2));
      } else if (status === 'completed') {
        startedAt = new Date(tripDate);
        startedAt.setHours(parseInt(tripTime.split(':')[0]), parseInt(tripTime.split(':')[1]), 0, 0);
        // Completed 2-8 hours after start
        completedAt = new Date(startedAt);
        completedAt.setHours(completedAt.getHours() + Math.floor(Math.random() * 6) + 2);
      } else if (status === 'cancelled') {
        // Cancelled before trip date
        startedAt = undefined;
        completedAt = undefined;
      }

      const report = {
        route: route._id,
        bus: bus._id,
        mxDriver: mxDriver,
        usDriver: usDriver,
        tripDate: tripDate,
        tripTime: tripTime,
        origin: origin,
        destination: destination,
        busRouteName: busRouteName,
        routeName: route.name,
        passengers: passengers,
        status: status,
        startedAt: startedAt,
        completedAt: completedAt,
      };

      reports.push(report);
    }

    // Insert reports
    const createdReports = await DriverReport.insertMany(reports);
    console.log(`   ✓ Created ${createdReports.length} driver reports`);

    // Display summary
    console.log('\n✅ Driver report seeding completed successfully!');
    console.log('\nDriver Report Summary:');
    console.log(`- Total Reports Created: ${createdReports.length}`);
    
    const statusCounts = {
      started: createdReports.filter(r => r.status === 'started').length,
      completed: createdReports.filter(r => r.status === 'completed').length,
      cancelled: createdReports.filter(r => r.status === 'cancelled').length,
    };
    console.log(`- Started: ${statusCounts.started}`);
    console.log(`- Completed: ${statusCounts.completed}`);
    console.log(`- Cancelled: ${statusCounts.cancelled}`);
    
    console.log(`\n- Reports with MX Driver: ${createdReports.filter(r => r.mxDriver).length}`);
    console.log(`- Reports with US Driver: ${createdReports.filter(r => r.usDriver).length}`);
    console.log(`- Reports with Both Drivers: ${createdReports.filter(r => r.mxDriver && r.usDriver).length}`);

    // Show sample reports
    console.log('\nSample Reports:');
    const sampleReports = await DriverReport.find()
      .populate('route', 'name')
      .populate('bus', 'code serialNumber')
      .populate('origin', 'name')
      .populate('destination', 'name')
      .populate('mxDriver', 'email')
      .populate('usDriver', 'email')
      .limit(5)
      .lean();
    
    sampleReports.forEach((report, index) => {
      console.log(`\n${index + 1}. ${(report as any).route?.name || 'Unknown Route'}`);
      console.log(`   Bus: ${(report as any).bus?.code || 'N/A'} (${(report as any).bus?.serialNumber || 'N/A'})`);
      console.log(`   Route: ${(report as any).origin?.name || 'N/A'} → ${(report as any).destination?.name || 'N/A'}`);
      console.log(`   Date: ${report.tripDate.toLocaleDateString()} ${report.tripTime}`);
      console.log(`   Status: ${report.status}`);
      console.log(`   Passengers: ${report.passengers}`);
      console.log(`   MX Driver: ${(report as any).mxDriver?.email || 'N/A'}`);
      console.log(`   US Driver: ${(report as any).usDriver?.email || 'N/A'}`);
    });

  } catch (error) {
    console.error('❌ Error seeding driver reports:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
    process.exit(0);
  }
}

// Run the seed function
if (require.main === module) {
  seedDriverReports();
}

export default seedDriverReports;

