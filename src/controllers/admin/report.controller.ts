import { Request, Response } from "express";
import { STATUS_CODES } from "../../constants/statusCodes";
import ResponseUtil from "../../utils/Response/responseUtils";
import { ADMIN_CONSTANTS } from "../../constants/messages";
import { CustomError } from "../../classes/CustomError";
import RouteModel from "../../models/route.model";
import BusModel from "../../models/bus.model";
import PassengerModel from "../../models/passenger.models";
import AuthModel from "../../models/auth.model";
import OfficeModel from "../../models/office.model";
import DestinationModel from "../../models/destinations.model";
import BookingModel from "../../models/booking.model";
import DriverReport from "../../models/driver-report.model";
import { SeatStatus, UserRole } from "../../models/common/types";
import helper from "../../helper";
import mongoose from "mongoose";

export const getRouteSeatReport = async (req: Request, res: Response) => {
  try {
    const { routeId, date } = req.query;

    if (!routeId) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "Route ID is required");
    }

    if (!date) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "Date is required");
    }

    // Parse the date
    const reportDate = new Date(date as string);
    if (isNaN(reportDate.getTime())) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "Invalid date format");
    }

    // Find the route with populated data
    const route = await RouteModel.findById(routeId)
      .populate('origin', 'name description')
      .populate('destination', 'name description')
      .populate({
        path: 'bus',
        select: 'serialNumber code driver seatLayout capacity totalBookedSeats',
        populate: {
          path: 'driver',
          select: 'profile',
          populate: {
            path: 'profile',
            select: 'firstName secondName lastName contactNumber'
          }
        }
      });

    if (!route) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.NOT_FOUND, "Route not found");
    }

    const busDetails = route.bus as any;
    if (!busDetails) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.NOT_FOUND, "Bus not found for this route");
    }

    // Create a new date object to avoid modifying the original
    const startOfDay = new Date(reportDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(reportDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Get seat layout
    const seatLayout = busDetails.seatLayout;
    const seats = seatLayout.seats || [];

    // Collect all booking IDs and seat labels from departureDateBookings for the queried date
    const bookingIds: any[] = [];
    const bookedSeatLabels: string[] = [];
    
    seats.forEach((seat: any) => {
      (seat.departureDateBookings || []).forEach((booking: any) => {
        const bookingDate = new Date(booking.departureDate);
        if (bookingDate >= startOfDay && bookingDate < endOfDay) {
          if (booking.bookingId) {
            bookingIds.push(booking.bookingId);
          }
          if (booking.status === 'booked') {
            bookedSeatLabels.push(seat.seatLabel);
          }
        }
      });
    });

    // Get passengers for this bus and specific seat labels that are booked
    const passengers = await PassengerModel.find({
      busId: busDetails._id,
      seatLabel: { $in: bookedSeatLabels },
      isCancelled: false
    }).sort({ seatLabel: 1 });

    // Create a passenger map for quick lookup by seat label
    const passengerMap = new Map(passengers.map(p => [p.seatLabel, p]));

    // Fetch all bookings with passenger details
    const bookings = await BookingModel.find({
      _id: { $in: bookingIds }
    });

    // Create a map: bookingId + seatLabel -> passenger from booking
    const bookingPassengerMap = new Map();
    bookings.forEach((booking: any) => {
      (booking.passengers || []).forEach((passenger: any) => {
        if (passenger.seatLabel) {
          bookingPassengerMap.set(`${booking._id}_${passenger.seatLabel}`, passenger);
        }
      });
    });
    
    // Sort seats by seat label for proper ordering
    seats.sort((a: any, b: any) => {
      const aNum = parseInt(a.seatLabel.replace(/\D/g, ''));
      const bNum = parseInt(b.seatLabel.replace(/\D/g, ''));
      return aNum - bNum;
    });

    // Create seat report by checking both PassengerModel and departureDateBookings
    const seatReport = seats.map((seat: any) => {
      // Check departureDateBookings for this specific date
      const dateBooking = (seat.departureDateBookings || []).find((booking: any) => {
        const bookingDate = new Date(booking.departureDate);
        return bookingDate >= startOfDay && bookingDate < endOfDay;
      });

      // Get passenger from PassengerModel (source of truth if exists)
      const passenger = passengerMap.get(seat.seatLabel);
      
      // Get passenger from Booking model if no PassengerModel record
      let bookingPassenger = null;
      if (!passenger && dateBooking?.bookingId) {
        bookingPassenger = bookingPassengerMap.get(`${dateBooking.bookingId}_${seat.seatLabel}`);
      }

      // Determine if seat is booked
      const isBooked = dateBooking?.status === 'booked' || !!passenger;
      const isSeatFree = !isBooked;
      
      // Get passenger info
      let passengerInfo = null;
      if (passenger) {
        // From PassengerModel (confirmed with ticket)
        passengerInfo = {
          fullName: passenger.fullName,
          ticketNumber: passenger.ticketNumber,
          contactNumber: passenger.contactNumber,
          isReturnTrip: passenger.ticketNumber?.includes('-RT') || false,
          alreadyScanned: passenger.alreadyScanned,
          from: passenger.From,
          to: passenger.To
        };
      } else if (bookingPassenger) {
        // From Booking model (booked but no ticket yet)
        passengerInfo = {
          fullName: `${bookingPassenger.firstName || ''} ${bookingPassenger.lastName || ''}`.trim(),
          ticketNumber: bookingPassenger.passengerRef || `Ref: ${dateBooking.bookingId}`,
          contactNumber: 'N/A',
          isReturnTrip: false,
          alreadyScanned: false,
          from: (route.origin as any)?.name || '',
          to: (route.destination as any)?.name || ''
        };
      }
      
      return {
        seatNumber: seat.seatLabel,
        seatIndex: seat.seatIndex,
        status: isSeatFree ? SeatStatus.AVAILABLE : SeatStatus.BOOKED,
        isAvailable: isSeatFree,
        passengerInfo,
        isFree: isSeatFree
      };
    });

    // Calculate statistics based on seat report
    const totalSeats = seats.length;
    const bookedSeats = seatReport.filter((seat: any) => !seat.isFree).length;
    const availableSeats = seatReport.filter((seat: any) => seat.isFree).length;
    const occupiedSeats = passengers.filter(p => p.alreadyScanned).length;

    // Get driver information
    const driver = busDetails.driver as any;
    const driverInfo = driver ? {
      id: driver._id,
      name: driver.profile ? `${driver.profile.firstName || ''} ${driver.profile.secondName || ''} ${driver.profile.lastName || ''}`.trim() || 'Unknown Driver' : 'Unknown Driver',
      contact: driver.profile?.contactNumber || 'N/A'
    } : null;

    // Format the response data similar to the interface shown
    const reportData = {
      routeInfo: {
        id: route._id,
        name: route.name,
        from: (route.origin as any)?.name || 'Unknown',
        to: (route.destination as any)?.name || 'Unknown',
        date: reportDate.toISOString().split('T')[0],
        time: route.dayTime && route.dayTime.length > 0 ? route.dayTime[0].time : 'N/A'
      },
      busInfo: {
        id: busDetails._id,
        serialNumber: busDetails.serialNumber,
        code: busDetails.code,
        driver: driverInfo,
        capacity: busDetails.capacity,
        totalBookedSeats: busDetails.totalBookedSeats
      },
      statistics: {
        totalSeats,
        bookedSeats,
        availableSeats,
        occupiedSeats,
        occupancyRate: totalSeats > 0 ? ((bookedSeats / totalSeats) * 100).toFixed(1) : '0'
      },
      seatReport: seatReport.map((seat: any) => {
        const passengerName = seat.passengerInfo?.fullName || (seat.isFree ? 'Free' : 'Unknown');
        return {
          seatNumber: seat.seatNumber,
          status: seat.isFree ? 'Free' : 'Occupied',
          passengerName,
          ticketNumber: seat.passengerInfo?.ticketNumber || null,
          contactNumber: seat.passengerInfo?.contactNumber || null,
          isReturnTrip: seat.passengerInfo?.isReturnTrip || false,
          alreadyScanned: seat.passengerInfo?.alreadyScanned || false,
          // Additional fields for frontend display
          displayText: seat.isFree ? 'Free' : `${seat.seatNumber}: ${passengerName?.toUpperCase() || 'UNKNOWN'}`,
          isAvailable: seat.isFree
        };
      }),
      generatedAt: new Date().toISOString()
    };

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      reportData,
      "Route seat report generated successfully"
    );

  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

export const getRouteSeatReportDownload = async (req: Request, res: Response) => {
  try {
    const { routeId, date } = req.query;

    if (!routeId) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "Route ID is required");
    }

    if (!date) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "Date is required");
    }

    // Parse the date
    const reportDate = new Date(date as string);
    if (isNaN(reportDate.getTime())) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.BAD_REQUEST, "Invalid date format");
    }

    // Find the route with populated data
    const route = await RouteModel.findById(routeId)
      .populate('origin', 'name description')
      .populate('destination', 'name description')
      .populate({
        path: 'bus',
        select: 'serialNumber code driver seatLayout capacity totalBookedSeats mxdriverId',
        populate: [{
          path: 'driver',
          select: 'profile',
          populate: {
            path: 'profile',
            select: 'firstName secondName lastName contactNumber'
          }
        },
        {
          path: 'mxdriverId',
          select: 'profile',
          populate: {
            path: 'profile',
            select: 'firstName secondName lastName contactNumber'
          }
        }
      ]
      });

    if (!route) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.NOT_FOUND, "Route not found");
    }

    const busDetails = route.bus as any;
    if (!busDetails) {
      return ResponseUtil.errorResponse(res, STATUS_CODES.NOT_FOUND, "Bus not found for this route");
    }

    // Create a new date object to avoid modifying the original
    const startOfDay = new Date(reportDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(reportDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Get seat layout
    const seatLayout = busDetails.seatLayout;
    const seats = seatLayout.seats || [];

    // Collect all booking IDs and seat labels from departureDateBookings for the queried date
    const bookingIds: any[] = [];
    const bookedSeatLabels: string[] = [];
    
    seats.forEach((seat: any) => {
      (seat.departureDateBookings || []).forEach((booking: any) => {
        const bookingDate = new Date(booking.departureDate);
        if (bookingDate >= startOfDay && bookingDate < endOfDay) {
          if (booking.bookingId) {
            bookingIds.push(booking.bookingId);
          }
          if (booking.status === 'booked') {
            bookedSeatLabels.push(seat.seatLabel);
          }
        }
      });
    });

    // Get passengers for this bus and specific seat labels that are booked
    const passengers = await PassengerModel.find({
      busId: busDetails._id,
      seatLabel: { $in: bookedSeatLabels },
      isCancelled: false
    }).sort({ seatLabel: 1 });

    // Create a passenger map for quick lookup by seat label
    const passengerMap = new Map(passengers.map(p => [p.seatLabel, p]));

    // Fetch all bookings with passenger details
    const bookings = await BookingModel.find({
      _id: { $in: bookingIds }
    });

    // Create a map: bookingId + seatLabel -> passenger from booking
    const bookingPassengerMap = new Map();
    bookings.forEach((booking: any) => {
      (booking.passengers || []).forEach((passenger: any) => {
        if (passenger.seatLabel) {
          bookingPassengerMap.set(`${booking._id}_${passenger.seatLabel}`, passenger);
        }
      });
    });
    
    // Sort seats by seat label for proper ordering
    seats.sort((a: any, b: any) => {
      const aNum = parseInt(a.seatLabel.replace(/\D/g, ''));
      const bNum = parseInt(b.seatLabel.replace(/\D/g, ''));
      return aNum - bNum;
    });

    // Create seat report by checking both PassengerModel and departureDateBookings
    const seatReport = seats.map((seat: any) => {
      // Check departureDateBookings for this specific date
      const dateBooking = (seat.departureDateBookings || []).find((booking: any) => {
        const bookingDate = new Date(booking.departureDate);
        return bookingDate >= startOfDay && bookingDate < endOfDay;
      });

      // Get passenger from PassengerModel (source of truth if exists)
      const passenger = passengerMap.get(seat.seatLabel);
      
      // Get passenger from Booking model if no PassengerModel record
      let bookingPassenger = null;
      if (!passenger && dateBooking?.bookingId) {
        bookingPassenger = bookingPassengerMap.get(`${dateBooking.bookingId}_${seat.seatLabel}`);
      }

      // Determine if seat is booked
      const isBooked = dateBooking?.status === 'booked' || !!passenger;
      const isSeatFree = !isBooked;
      
      // Get passenger info
      let passengerInfo = null;
      if (passenger) {
        // From PassengerModel (confirmed with ticket)
        passengerInfo = {
          fullName: passenger.fullName,
          from: passenger.From,
          to: passenger.To
        };
      } else if (bookingPassenger) {
        // From Booking model (booked but no ticket yet)
        passengerInfo = {
          fullName: `${bookingPassenger.firstName || ''} ${bookingPassenger.lastName || ''}`.trim(),
          from: (route.origin as any)?.name || '',
          to: (route.destination as any)?.name || ''
        };
      }
      
      return {
        seatNumber: seat.seatLabel,
        seatIndex: seat.seatIndex,
        isFree: isSeatFree,
        passengerInfo
      };
    });

    // Get driver information from DriverReport for this route and date
    let mxDriverName = busDetails.mxdriverId?.profile?.firstName + ' ' + busDetails.mxdriverId?.profile?.secondName + ' ' + busDetails.mxdriverId?.profile?.lastName;
    let usDriverName = busDetails.driver?.profile?.firstName + ' ' + busDetails.driver?.profile?.secondName + ' ' + busDetails.driver?.profile?.lastName;

    // Generate PDF
    return await generateRouteSeatReportPDF(
      res,
      {
        busCode: busDetails.code || busDetails.serialNumber,
        origin: (route.origin as any)?.name || 'Unknown',
        destination: (route.destination as any)?.name || 'Unknown',
        date: reportDate,
        time: route.dayTime && route.dayTime.length > 0 ? route.dayTime[0].time : 'N/A',
        mxDriver: mxDriverName,
        usDriver: usDriverName
      },
      seatReport
    );

  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

// Helper function to generate route seat report PDF
const generateRouteSeatReportPDF = async (
  res: Response,
  routeInfo: {
    busCode: string;
    origin: string;
    destination: string;
    date: Date;
    time: string;
    mxDriver: string;
    usDriver: string;
  },
  seatReport: any[]
) => {
  const PDFDocument = require('pdfkit');
  const fs = require('fs');
  const path = require('path');
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  // Set response headers
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=RouteSeatReport-${routeInfo.busCode}-${routeInfo.date.toISOString().split('T')[0]}.pdf`
  );

  // Pipe PDF to response
  doc.pipe(res);

  // Add logo
  try {
    const logoPath = path.join(process.cwd(), 'public', 'uploads', 'logo.png');
    if (fs.existsSync(logoPath)) {
      // Center the logo horizontally at the top
      const pageWidth = doc.page.width;
      const logoWidth = 120;
      const logoHeight = 60;
      const centerX = (pageWidth - logoWidth) / 2;
      doc.image(logoPath, centerX, 30, { width: logoWidth, height: logoHeight, fit: [logoWidth, logoHeight] });
    }
  } catch (error) {
    console.error('Error adding logo to PDF:', error);
  }

  // Add header info - Left Column
  const leftX = 50;
  const rightX = 300;
  let headerY = 100;

  // BUS (Left Column)
  doc.fontSize(11).font('Helvetica-Bold')
    .fillColor('black')
    .text('BUS:', leftX, headerY);
  
  const busText = `${routeInfo.busCode} ${routeInfo.origin} - ${routeInfo.destination}`;
  doc.fontSize(11).font('Helvetica')
    .text(busText, leftX + 30, headerY);
  
  // Draw line under BUS
  doc.moveTo(leftX, headerY + 15).lineTo(leftX + 250, headerY + 15).stroke();

  // DATE (Right Column)
  const formattedDate = `${(routeInfo.date.getMonth() + 1).toString().padStart(2, '0')}/${routeInfo.date.getDate().toString().padStart(2, '0')}/${routeInfo.date.getFullYear()}`;
  doc.fontSize(11).font('Helvetica-Bold')
    .text('DATE:', rightX+40, headerY)
    .font('Helvetica')
    .text(`${formattedDate} ${routeInfo.time}`, rightX + 80, headerY);
  
  // Draw line under DATE
  doc.moveTo(rightX, headerY + 15).lineTo(rightX + 200, headerY + 15).stroke();

  // MX DRIVER (Left Column)
  headerY += 40;
  doc.fontSize(11).font('Helvetica-Bold')
    .text('MX DRIVER:', leftX, headerY)
    .font('Helvetica')
    .text(routeInfo.mxDriver || 'N/A', leftX + 80, headerY);
  
  // Draw line under MX DRIVER
  doc.moveTo(leftX, headerY + 15).lineTo(leftX + 200, headerY + 15).stroke();

  // US DRIVER (Right Column)
  doc.font('Helvetica-Bold')
    .text('US DRIVER:', rightX, headerY)
    .font('Helvetica')
    .text(routeInfo.usDriver || 'N/A', rightX + 80, headerY);
  
  // Draw line under US DRIVER
  doc.moveTo(rightX, headerY + 15).lineTo(rightX + 200, headerY + 15).stroke();

  // Draw line separator
  doc.moveTo(50, headerY + 30).lineTo(545, headerY + 30).stroke();

  // Split seats into two columns
  const seatsPerColumn = Math.ceil(seatReport.length / 2);
  const leftColumnSeats = seatReport.slice(0, seatsPerColumn);
  const rightColumnSeats = seatReport.slice(seatsPerColumn);

  let currentY = headerY + 50;
  const lineHeight = 20;
  const fontSize = 9;
  const columnWidth = 240;
  const boxHeight = lineHeight;
  const seatNumberWidth = 30;

  // Draw left column
  leftColumnSeats.forEach((seat: any, index: number) => {
    const y = currentY + (index * lineHeight);
    
    // Check if we need a new page
    if (y > 750) {
      doc.addPage();
      currentY = 50;
    }
    
    const actualY = y > 750 ? 50 + ((index - Math.floor((y - 150) / lineHeight)) * lineHeight) : y;
    
    // Draw box around the row
    doc.rect(leftX, actualY - 2, columnWidth, boxHeight)
       .strokeColor('#CCCCCC')
       .lineWidth(0.5)
       .stroke();
    
    // Draw vertical line to separate seat number from passenger info
    doc.moveTo(leftX + seatNumberWidth, actualY - 2)
       .lineTo(leftX + seatNumberWidth, actualY + boxHeight - 2)
       .strokeColor('#CCCCCC')
       .lineWidth(0.5)
       .stroke();
    
    if (seat.isFree) {
      // Empty seat - just show number in black
      doc.fontSize(fontSize)
         .font('Helvetica')
         .fillColor('#000000')
         .text(`${seat.seatNumber}`, leftX + 5, actualY, { width: seatNumberWidth - 5 });
    } else {
      // Occupied seat - seat number in first column, passenger info in second
      doc.fontSize(fontSize)
         .font('Helvetica')
         .fillColor('#000000')
         .text(`${seat.seatNumber}`, leftX + 5, actualY, { width: seatNumberWidth - 5 });
      
      const passengerText = seat.passengerInfo?.fullName 
        ? `${seat.passengerInfo.fullName.toUpperCase()} (${seat.passengerInfo.from}, ${seat.passengerInfo.to})`
        : '';
      
      doc.fontSize(fontSize)
         .font('Helvetica')
         .fillColor('#0000FF')
         .text(passengerText, leftX + seatNumberWidth + 5, actualY, { width: columnWidth - seatNumberWidth - 10 });
    }
  });

  // Draw right column
  currentY = headerY + 50;
  rightColumnSeats.forEach((seat: any, index: number) => {
    const y = currentY + (index * lineHeight);
    
    // Check if we need a new page (sync with left column)
    const leftColumnIndex = index;
    const leftColumnY = 150 + (leftColumnIndex * lineHeight);
    if (leftColumnY > 750) {
      // Left column triggered new page, sync right column
      const newPageIndex = Math.floor((leftColumnY - 150) / lineHeight) - Math.floor((750 - 150) / lineHeight);
      if (index === newPageIndex) {
        currentY = 50 - (leftColumnIndex * lineHeight);
      }
    }
    
    const actualY = y > 750 ? 50 + ((index - Math.floor((y - 150) / lineHeight)) * lineHeight) : y;
    
    // Draw box around the row
    doc.rect(rightX, actualY - 2, columnWidth, boxHeight)
       .strokeColor('#CCCCCC')
       .lineWidth(0.5)
       .stroke();
    
    // Draw vertical line to separate seat number from passenger info
    doc.moveTo(rightX + seatNumberWidth, actualY - 2)
       .lineTo(rightX + seatNumberWidth, actualY + boxHeight - 2)
       .strokeColor('#CCCCCC')
       .lineWidth(0.5)
       .stroke();
    
    if (seat.isFree) {
      // Empty seat - just show number in black
      doc.fontSize(fontSize)
         .font('Helvetica')
         .fillColor('#000000')
         .text(`${seat.seatNumber}`, rightX + 5, actualY, { width: seatNumberWidth - 5 });
    } else {
      // Occupied seat - seat number in first column, passenger info in second
      doc.fontSize(fontSize)
         .font('Helvetica')
         .fillColor('#000000')
         .text(`${seat.seatNumber}`, rightX + 5, actualY, { width: seatNumberWidth - 5 });
      
      const passengerText = seat.passengerInfo?.fullName 
        ? `${seat.passengerInfo.fullName.toUpperCase()} (${seat.passengerInfo.from}, ${seat.passengerInfo.to})`
        : '';
      
      doc.fontSize(fontSize)
         .font('Helvetica')
         .fillColor('#0000FF')
         .text(passengerText, rightX + seatNumberWidth + 5, actualY, { width: columnWidth - seatNumberWidth - 10 });
    }
  });

  // Add page number at bottom
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).font('Helvetica')
      .fillColor('#666666')
      .text(
        `Page ${i + 1} of ${pages.count}`,
        50,
        doc.page.height-60,
        { align: 'center' }
      );
  }

  // Finalize PDF
  doc.end();
};

export const getSalesReport = async (req: Request, res: Response) => {
  try {
    const { fromDate, toDate, salesDateType, salesAgent, salesOffice, page, limit } = req.query;

    // Build query for customPaginate
    const query: any = { isCancelled: false , bookedBy: { $nin: [UserRole.CUSTOMER, UserRole.DRIVER] }};

    // Date filtering
    if (fromDate || toDate) {
      // 'sale' = By Sale Date (createdAt), 'departure' = By Departure Date (DepartureDate)
      const dateField = salesDateType === 'departure' ? 'DepartureDate' : 'createdAt';
      query[dateField] = {};

      if (fromDate) {
        const startDate = new Date(fromDate as string);
        startDate.setHours(0, 0, 0, 0);
        query[dateField].$gte = startDate;
      }

      if (toDate) {
        const endDate = new Date(toDate as string);
        endDate.setHours(23, 59, 59, 999);
        query[dateField].$lte = endDate;
      }
    }

    // Sales agent filter
    if (salesAgent) {
      query.user = salesAgent;
    }

    // Sales office filter
    if (salesOffice) { 
      query.salesOffice = salesOffice;
    }

    // Pagination options with populate
    const options = {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      sort: { createdAt: -1 } as Record<string, 1 | -1>,
      populate: [
        {
          path: 'user', 
          select: 'profile',
          populate: {
            path: 'profile',
            select: 'firstName secondName lastName contactNumber'
          }
        },
        {
          path: 'busId',
          select: 'serialNumber code'
        }
      ]
    };

    // Fetch paginated data
    const salesData = await helper.PaginateHelper.customPaginate(
      "sales",
      PassengerModel,
      query,
      options
    );

    // Get unique destination names for sales office lookup
    // const destinationNames = [...new Set(
    //   (salesData as any).sales.flatMap((p: any) => [p.From, p.To])
    // )];

    // const destinations = await DestinationModel.find({ 
    //   name: { $in: destinationNames },
    //   isActive: true 
    // }).populate('salesOffice', 'name');
    
    // // Create a map for quick destination lookup by name
    // const destinationMap = new Map(
    //   destinations.map((dest: any) => [dest.name, dest])
    // );

    // Transform the data to match the report format
    const formattedSales = (salesData as any).sales.map((passenger: any) => {
      const user = passenger.user as any;
      const bus = passenger.busId as any;
      
      // Get agent name
      const soldBy = user?.profile 
        ? `${user.profile.firstName || ''} ${user.profile.secondName || ''} ${user.profile.lastName || ''}`.trim()
        : 'Unknown';

      // Use stored price and currency from passenger record
      const price = passenger.price || 0;
      const currency = passenger.currency || 'MXN';

      // Get sales office from destination
      // let salesOfficeName = 'Main Office Dallas'; // Default
      // const destination = destinationMap.get(passenger.To);
      // if (destination && destination.salesOffice) {
      //   salesOfficeName = (destination.salesOffice as any).name || salesOfficeName;
      // }

      return {
        salesOffice: passenger.office,
        soldBy,
        from: passenger.From,
        to: passenger.To,
        departureDate: new Date(passenger.DepartureDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }),
        passenger: passenger.fullName,
        price: `$${price.toFixed(2)}`,
        qty: 1,
        ticketNumber: passenger.ticketNumber,
        seatLabel: passenger.seatLabel,
        contactNumber: passenger.contactNumber,
        busCode: bus?.code || 'N/A',
        bookedAt: passenger.createdAt,
        type: passenger.type
      };
    });

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      {
        sales: formattedSales,
        totalDocs: (salesData as any).totalDocs,
        currentPage: (salesData as any).currentPage,
        totalPages: (salesData as any).totalPages,
        hasNextPage: (salesData as any).hasNextPage,
        hasPrevPage: (salesData as any).hasPrevPage
      },
      "Sales report generated successfully"
    );

  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

export const getDriversReport = async (req: Request, res: Response) => {
  try {
    const { fromDate, toDate, driverId, page, limit } = req.query;

    // Build query for driver reports
    const query: any = {};

    // Date filtering
    if (fromDate || toDate) {
      query.tripDate = {};
      if (fromDate) {
        const startDate = new Date(fromDate as string);
        startDate.setHours(0, 0, 0, 0);
        query.tripDate.$gte = startDate;
      }
      if (toDate) {
        const endDate = new Date(toDate as string);
        endDate.setHours(23, 59, 59, 999);
        query.tripDate.$lte = endDate;
      }
    }

    // Driver filter - check both mxDriver and usDriver
    if (driverId) {
      query.$or = [
        { mxDriver: driverId },
        { usDriver: driverId }
      ];
    }

    // Pagination options with populate
    const options = {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      sort: { tripDate: -1, tripTime: -1 } as Record<string, 1 | -1>,
      populate: [
        {
          path: 'mxDriver',
          select: 'profile',
          populate: {
            path: 'profile',
            select: 'firstName secondName lastName'
          }
        },
        {
          path: 'usDriver',
          select: 'profile',
          populate: {
            path: 'profile',
            select: 'firstName secondName lastName'
          }
        },
        {
          path: 'bus',
          select: 'serialNumber code'
        },
        {
          path: 'origin',
          select: 'name'
        },
        {
          path: 'destination',
          select: 'name'
        }
      ]
    };

    // Fetch paginated driver reports
    const reportsData = await helper.PaginateHelper.customPaginate(
      "reports",
      DriverReport,
      query,
      options
    );

    // Transform the data to match the report format
    const formattedReports = (reportsData as any).reports.map((report: any) => {
      // Get driver names
      const mxDriver = report.mxDriver?.profile
        ? `${report.mxDriver.profile.firstName || ''} ${report.mxDriver.profile.secondName || ''} ${report.mxDriver.profile.lastName || ''}`.trim()
        : 'N/A';

      const usDriver = report.usDriver?.profile
        ? `${report.usDriver.profile.firstName || ''} ${report.usDriver.profile.secondName || ''} ${report.usDriver.profile.lastName || ''}`.trim()
        : 'N/A';

      return {
        busRouteName: report.busRouteName,
        routeName: report.routeName,
        tripDate: new Date(report.tripDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }),
        tripTime: report.tripTime,
        mxDriver,
        usDriver,
        passengers: report.passengers,
        origin: report.origin?.name || 'N/A',
        destination: report.destination?.name || 'N/A',
        busCode: report.bus?.code || 'N/A',
        status: report.status,
        startedAt: report.startedAt,
        completedAt: report.completedAt
      };
    });

    return ResponseUtil.successResponse(
      res,
      STATUS_CODES.SUCCESS,
      {
        reports: formattedReports,
        totalDocs: (reportsData as any).totalDocs,
        currentPage: (reportsData as any).currentPage,
        totalPages: (reportsData as any).totalPages,
        hasNextPage: (reportsData as any).hasNextPage,
        hasPrevPage: (reportsData as any).hasPrevPage
      },
      "Drivers report generated successfully"
    );

  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

export const getSalesReportDownload = async (req: Request, res: Response) => {
  try {
    const {
      fromDate,
      toDate,
      salesDateType = 'sale', // 'sale' or 'departure'
      salesAgent,
      salesOffice,
      format = 'excel' // 'excel' or 'pdf'
    } = req.query;

    // Set default dates if not provided
    const startDate = fromDate 
      ? new Date(new Date(fromDate as string).setHours(0, 0, 0, 0))
      : new Date(new Date().setDate(new Date().getDate() - 7));
    
    const endDate = toDate
      ? new Date(new Date(toDate as string).setHours(23, 59, 59, 999))
      : new Date(new Date().setHours(23, 59, 59, 999));

    // Build query
    const query: any = {
      isCancelled: false,
      isValid: true,
      bookedBy: { $ne: 'customer' },
    };

    // Date filter based on type
    if (salesDateType === 'sale') {
      query.createdAt = { $gte: startDate, $lte: endDate };
    } else {
      query.DepartureDate = { $gte: startDate, $lte: endDate };
    }

    // Sales agent filter
    if (salesAgent) {
      query.user = salesAgent;
    }

    // Sales office filter
    if (salesOffice) {
      query.salesOffice = salesOffice;
    }

    // Fetch passengers data
    const passengers = await PassengerModel.find(query)
      .populate({
        path: 'user',
        populate: {
          path: 'profile',
          select: 'firstName lastName',
          populate: {
            path: 'office',
            select: 'name'
          }
        }
      })
      .populate('salesOffice', 'name location')
      .populate('busId', 'serialNumber code')
      .sort({ salesOffice: 1, paymentIntentId: 1, createdAt: 1 });

    // Group data by sales office -> payment type -> agent
    const groupedData: any = {};
    
    for (const passenger of passengers) {
      const office = (passenger.user as any)?.profile?.office?.name || 'Unknown Office';
      const paymentType = passenger.paymentIntentId ? 'CreditCard' : passenger.extraBaggageIntentId ? 'Free' : 'Cash';
      const bookedByUser = passenger.user as any;
      const agentName = bookedByUser?.profile?.firstName 
        ? `${bookedByUser.profile.firstName} ${bookedByUser.profile.lastName || ''}`.trim()
        : 'N/A';

      // Create office group if doesn't exist
      if (!groupedData[office]) {
        groupedData[office] = {};
      }

      // Create payment type group if doesn't exist
      if (!groupedData[office][paymentType]) {
        groupedData[office][paymentType] = {};
      }

      // Create agent group if doesn't exist
      if (!groupedData[office][paymentType][agentName]) {
        groupedData[office][paymentType][agentName] = [];
      }

      // Add passenger to group
      groupedData[office][paymentType][agentName].push(passenger);
    }

    // Generate report based on format
    if (format === 'pdf') {
      return await generatePDFReport(res, groupedData, startDate, endDate, salesDateType as string);
    } else {
      return await generateExcelReport(res, groupedData, startDate, endDate, salesDateType as string);
    }

  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

// Helper function to generate Excel report
const generateExcelReport = async (
  res: Response,
  groupedData: any,
  startDate: Date,
  endDate: Date,
  salesDateType: string
) => {
  const ExcelJS = require('exceljs');
  const fs = require('fs');
  const path = require('path');
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('SalesReport');

  // Set column widths to match the expected format
  worksheet.columns = [
    { width: 15 }, // Vendido en
    { width: 15 }, // Forma de Pago
    { width: 20 }, // Agente
    { width: 35 }, // De
    { width: 25 }, // Hacia
    { width: 20 }, // Fecha Salida
    { width: 12 }, // # Autobus
    { width: 40 }, // Nombre Pasajero
    { width: 20 }, // Fecha Venta
    { width: 12 }, // Precio US
    { width: 12 }, // Precio MX
    { width: 10 }  // Cantidad
  ];

  // Add empty row for logo space
  const logoRow = worksheet.addRow([]);
  logoRow.height = 50;

  // Add logo image
  try {
    const logoPath = path.join(process.cwd(), 'public', 'uploads', 'logo.png');
    if (fs.existsSync(logoPath)) {
      const imageId = workbook.addImage({
        filename: logoPath,
        extension: 'png',
      });
      worksheet.addImage(imageId, {
        tl: { col: 0, row: 0 },
        ext: { width: 180, height: 80 }
      });
    }
  } catch (error) {
    console.error('Error adding logo to Excel:', error);
  }

  // Add title in the same row as logo (to the right)
  worksheet.getCell('C1').value = `Reporte de Ventas Por Dia de ${salesDateType === 'sale' ? 'Venta' : 'Salida'} Entre ${startDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })} y ${endDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}`;
  worksheet.mergeCells('C1:L1');
  worksheet.getCell('C1').font = { bold: true, size: 12, name: 'Calibri' };
  worksheet.getCell('C1').alignment = { horizontal: 'left', vertical: 'middle' };

  // Add empty row
  worksheet.addRow([]);

  // Add headers
  const headerRow = worksheet.addRow([
    'Vendido en',
    'Forma de Pago',
    'Agente',
    'De',
    'Hacia',
    'Fecha Salida',
    '# Autobus',
    'Nombre Pasajero',
    'Fecha Venta',
    'Precio US',
    'Precio MX',
    'Cantidad'
  ]);
  headerRow.font = { bold: true, name: 'Calibri', size: 10 };
  headerRow.eachCell((cell: any) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9D9D9' }
    };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  let grandTotalUS = 0;
  let grandTotalMX = 0;
  let grandTotalCount = 0;

  // Add data rows with proper grouping (like the expected format)
  for (const [office, paymentTypes] of Object.entries(groupedData)) {
    for (const [paymentType, agents] of Object.entries(paymentTypes as any)) {
      for (const [agent, passengersList] of Object.entries(agents as any)) {
        let subtotalUS = 0;
        let subtotalMX = 0;
        let subtotalCount = 0;
        let isFirstRowInGroup = true;

        // Add each passenger
        for (const passenger of passengersList as any[]) {
          const priceUS = passenger.price || 0;
          const priceMX = priceUS * 20; // 1 USD = 20 MXN conversion rate
          const depDate = new Date(passenger.DepartureDate);
          const saleDate = new Date(passenger.createdAt);
          
          // Format dates
          const fechaSalida = `${(depDate.getMonth() + 1).toString().padStart(2, '0')}/${depDate.getDate().toString().padStart(2, '0')}/${depDate.getFullYear()} ${depDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
          const fechaVenta = `${(saleDate.getMonth() + 1).toString().padStart(2, '0')}/${saleDate.getDate().toString().padStart(2, '0')}/${saleDate.getFullYear()} ${saleDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
          
          const row = worksheet.addRow([
            isFirstRowInGroup ? office : '', // Only show office on first row
            isFirstRowInGroup ? paymentType : '', // Only show payment type on first row
            isFirstRowInGroup ? agent : '', // Only show agent on first row
            passenger.From || '',
            passenger.To || '',
            fechaSalida,
            (passenger.busId as any)?.code || '',
            `${passenger.ticketNumber} - ${passenger.fullName} (${passenger.type === 'round_trip' ? 'R' : 'S'})  (${passenger.seatLabel})`,
            fechaVenta,
            priceUS,
            priceMX,
            1
          ]);

          // Add formatting
          row.font = { name: 'Calibri', size: 10 };
          row.getCell(10).numFmt = '$#,##0.00';
          row.getCell(11).numFmt = '$#,##0.00';
          
          // Add borders to all cells
          row.eachCell((cell: any) => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
          });

          subtotalUS += priceUS;
          subtotalMX += priceMX;
          subtotalCount += 1;
          isFirstRowInGroup = false;
        }

        // Add subtotal row (Total appears in "Agente" column)
        const subtotalRow = worksheet.addRow([
          '', '', 'Total', '', '', '', '', '', '',
          subtotalUS,
          subtotalMX,
          subtotalCount
        ]);
        subtotalRow.font = { bold: true, name: 'Calibri', size: 10 };
        subtotalRow.getCell(10).numFmt = '$#,##0.00';
        subtotalRow.getCell(11).numFmt = '$#,##0.00';
        subtotalRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFEBCD' } // Light beige/tan color
        };
        subtotalRow.eachCell((cell: any) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });

        grandTotalUS += subtotalUS;
        grandTotalMX += subtotalMX;
        grandTotalCount += subtotalCount;
      }
    }
  }

  // Set response headers
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=PrintSalesReport-${startDate.toISOString().split('T')[0]}-${endDate.toISOString().split('T')[0]}.xlsx`
  );

  // Write to response
  await workbook.xlsx.write(res);
  res.end();
};

// Helper function to generate PDF report
const generatePDFReport = async (
  res: Response,
  groupedData: any,
  startDate: Date,
  endDate: Date,
  salesDateType: string
) => {
  const PDFDocument = require('pdfkit');
  const fs = require('fs');
  const path = require('path');
  const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });

  // Set response headers
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=PrintSalesReport-${startDate.toISOString().split('T')[0]}-${endDate.toISOString().split('T')[0]}.pdf`
  );

  // Pipe PDF to response
  doc.pipe(res);

  // Add logo
  try {
    const logoPath = path.join(process.cwd(), 'public', 'uploads', 'logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 30, 20, { width: 150, height: 50 });
    }
  } catch (error) {
    console.error('Error adding logo to PDF:', error);
  }

  // Add title (positioned to the right of logo)
  doc.fontSize(12).font('Helvetica-Bold')
    .fillColor('black')
    .text(
      `Reporte de Ventas Por Dia de ${salesDateType === 'sale' ? 'Venta' : 'Salida'} Entre ${startDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })} y ${endDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}`,
      200, 35,
      { align: 'left' }
    );
  
  doc.moveDown(1.5);

  // Table column positions and widths
  const tableTop = doc.y;
  const colPositions = {
    vendidoEn: 30,
    formaPago: 85,
    agente: 145,
    de: 210,
    hacia: 285,
    fechaSalida: 350,
    autobus: 435,
    pasajero: 475,
    fechaVenta: 585,
    precioUS: 660,
    precioMX: 710,
    cantidad: 760
  };

  // Draw table header
  const drawTableHeader = (y: number) => {
    doc.fontSize(8).font('Helvetica-Bold').fillColor('black');
    
    const headerHeight = 18;
    const colWidths = {
      vendidoEn: 55,
      formaPago: 60,
      agente: 65,
      de: 75,
      hacia: 65,
      fechaSalida: 85,
      autobus: 40,
      pasajero: 110,
      fechaVenta: 75,
      precioUS: 50,
      precioMX: 50,
      cantidad: 40
    };
    
    // Draw header background and cells with borders
    doc.rect(colPositions.vendidoEn, y, colWidths.vendidoEn, headerHeight).fillAndStroke('#D9D9D9', '#000000');
    doc.rect(colPositions.formaPago, y, colWidths.formaPago, headerHeight).fillAndStroke('#D9D9D9', '#000000');
    doc.rect(colPositions.agente, y, colWidths.agente, headerHeight).fillAndStroke('#D9D9D9', '#000000');
    doc.rect(colPositions.de, y, colWidths.de, headerHeight).fillAndStroke('#D9D9D9', '#000000');
    doc.rect(colPositions.hacia, y, colWidths.hacia, headerHeight).fillAndStroke('#D9D9D9', '#000000');
    doc.rect(colPositions.fechaSalida, y, colWidths.fechaSalida, headerHeight).fillAndStroke('#D9D9D9', '#000000');
    doc.rect(colPositions.autobus, y, colWidths.autobus, headerHeight).fillAndStroke('#D9D9D9', '#000000');
    doc.rect(colPositions.pasajero, y, colWidths.pasajero, headerHeight).fillAndStroke('#D9D9D9', '#000000');
    doc.rect(colPositions.fechaVenta, y, colWidths.fechaVenta, headerHeight).fillAndStroke('#D9D9D9', '#000000');
    doc.rect(colPositions.precioUS, y, colWidths.precioUS, headerHeight).fillAndStroke('#D9D9D9', '#000000');
    doc.rect(colPositions.precioMX, y, colWidths.precioMX, headerHeight).fillAndStroke('#D9D9D9', '#000000');
    doc.rect(colPositions.cantidad, y, colWidths.cantidad, headerHeight).fillAndStroke('#D9D9D9', '#000000');
    
    // Draw header text
    doc.fillColor('black')
       .text('Vendido en', colPositions.vendidoEn + 1, y + 5, { width: colWidths.vendidoEn - 2, align: 'center' })
       .text('Forma de Pago', colPositions.formaPago + 1, y + 5, { width: colWidths.formaPago - 2, align: 'center' })
       .text('Agente', colPositions.agente + 1, y + 5, { width: colWidths.agente - 2, align: 'center' })
       .text('De', colPositions.de + 1, y + 5, { width: colWidths.de - 2, align: 'center' })
       .text('Hacia', colPositions.hacia + 1, y + 5, { width: colWidths.hacia - 2, align: 'center' })
       .text('Fecha Salida', colPositions.fechaSalida + 1, y + 5, { width: colWidths.fechaSalida - 2, align: 'center' })
       .text('#Autobus', colPositions.autobus + 1, y + 5, { width: colWidths.autobus - 2, align: 'center' })
       .text('Nombre Pasajero', colPositions.pasajero + 1, y + 5, { width: colWidths.pasajero - 2, align: 'center' })
       .text('Fecha Venta', colPositions.fechaVenta + 1, y + 5, { width: colWidths.fechaVenta - 2, align: 'center' })
       .text('Precio US', colPositions.precioUS + 1, y + 5, { width: colWidths.precioUS - 2, align: 'center' })
       .text('Precio MX', colPositions.precioMX + 1, y + 5, { width: colWidths.precioMX - 2, align: 'center' })
       .text('Cantidad', colPositions.cantidad + 1, y + 5, { width: colWidths.cantidad - 2, align: 'center' });
    
    return y + headerHeight;
  };

  let currentY = drawTableHeader(tableTop);

  // Add data rows with proper table format
  for (const [office, paymentTypes] of Object.entries(groupedData)) {
    for (const [paymentType, agents] of Object.entries(paymentTypes as any)) {
      for (const [agent, passengersList] of Object.entries(agents as any)) {
        let subtotalUS = 0;
        let subtotalMX = 0;
        let subtotalCount = 0;
        let isFirstRowInGroup = true;

        // Add each passenger as a table row
        for (const passenger of passengersList as any[]) {
          // Check if we need a new page
          if (currentY > 520) {
            doc.addPage();
            currentY = drawTableHeader(30);
          }

          const priceUS = passenger.price || 0;
          const priceMX = priceUS * 20;
          const depDate = new Date(passenger.DepartureDate);
          const saleDate = new Date(passenger.createdAt);

          // Format dates
          const fechaSalida = `${(depDate.getMonth() + 1).toString().padStart(2, '0')}/${depDate.getDate().toString().padStart(2, '0')}/${depDate.getFullYear()} ${depDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
          const fechaVenta = `${(saleDate.getMonth() + 1).toString().padStart(2, '0')}/${saleDate.getDate().toString().padStart(2, '0')}/${saleDate.getFullYear()} ${saleDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;

          const rowHeight = 30;
          const colWidths = {
            vendidoEn: 55,
            formaPago: 60,
            agente: 65,
            de: 75,
            hacia: 65,
            fechaSalida: 85,
            autobus: 40,
            pasajero: 110,
            fechaVenta: 75,
            precioUS: 50,
            precioMX: 50,
            cantidad: 40
          };
          
          // Draw individual cell borders
          doc.rect(colPositions.vendidoEn, currentY, colWidths.vendidoEn, rowHeight).stroke('#000000');
          doc.rect(colPositions.formaPago, currentY, colWidths.formaPago, rowHeight).stroke('#000000');
          doc.rect(colPositions.agente, currentY, colWidths.agente, rowHeight).stroke('#000000');
          doc.rect(colPositions.de, currentY, colWidths.de, rowHeight).stroke('#000000');
          doc.rect(colPositions.hacia, currentY, colWidths.hacia, rowHeight).stroke('#000000');
          doc.rect(colPositions.fechaSalida, currentY, colWidths.fechaSalida, rowHeight).stroke('#000000');
          doc.rect(colPositions.autobus, currentY, colWidths.autobus, rowHeight).stroke('#000000');
          doc.rect(colPositions.pasajero, currentY, colWidths.pasajero, rowHeight).stroke('#000000');
          doc.rect(colPositions.fechaVenta, currentY, colWidths.fechaVenta, rowHeight).stroke('#000000');
          doc.rect(colPositions.precioUS, currentY, colWidths.precioUS, rowHeight).stroke('#000000');
          doc.rect(colPositions.precioMX, currentY, colWidths.precioMX, rowHeight).stroke('#000000');
          doc.rect(colPositions.cantidad, currentY, colWidths.cantidad, rowHeight).stroke('#000000');

          // Draw cell content
          doc.fontSize(7).font('Helvetica').fillColor('black');
          
          if (isFirstRowInGroup) {
            doc.text(office, colPositions.vendidoEn + 2, currentY + 4, { width: colWidths.vendidoEn - 4 });
            doc.text(paymentType, colPositions.formaPago + 2, currentY + 4, { width: colWidths.formaPago - 4 });
            doc.text(agent, colPositions.agente + 2, currentY + 4, { width: colWidths.agente - 4 });
          }
          
          doc.text(passenger.From || '', colPositions.de + 2, currentY + 4, { width: colWidths.de - 4 })
             .text(passenger.To || '', colPositions.hacia + 2, currentY + 4, { width: colWidths.hacia - 4 })
             .text(fechaSalida, colPositions.fechaSalida + 2, currentY + 4, { width: colWidths.fechaSalida - 4 })
             .text((passenger.busId as any)?.code || '', colPositions.autobus + 2, currentY + 4, { width: colWidths.autobus - 4 })
             .text(`${passenger.ticketNumber} - ${passenger.fullName} (${passenger.type === 'round_trip' ? 'R' : 'S'}) (${passenger.seatLabel})`, colPositions.pasajero + 2, currentY + 4, { width: colWidths.pasajero - 4 })
             .text(fechaVenta, colPositions.fechaVenta + 2, currentY + 4, { width: colWidths.fechaVenta - 4 })
             .text(`$${priceUS.toFixed(2)}`, colPositions.precioUS + 2, currentY + 4, { width: colWidths.precioUS - 4, align: 'right' })
             .text(`$${priceMX.toFixed(2)}`, colPositions.precioMX + 2, currentY + 4, { width: colWidths.precioMX - 4, align: 'right' })
             .text('1', colPositions.cantidad + 2, currentY + 4, { width: colWidths.cantidad - 4, align: 'center' });

          currentY += rowHeight;
          subtotalUS += priceUS;
          subtotalMX += priceMX;
          subtotalCount += 1;
          isFirstRowInGroup = false;
        }

        // Add subtotal row
        if (currentY > 520) {
          doc.addPage();
          currentY = drawTableHeader(30);
        }

        const subtotalRowHeight = 16;
        const colWidths = {
          vendidoEn: 55,
          formaPago: 60,
          agente: 65,
          de: 75,
          hacia: 65,
          fechaSalida: 85,
          autobus: 40,
          pasajero: 125,
          fechaVenta: 75,
          precioUS: 50,
          precioMX: 50,
          cantidad: 40
        };
        
        // Draw subtotal row cells with background color
        doc.rect(colPositions.vendidoEn, currentY, colWidths.vendidoEn, subtotalRowHeight).fillAndStroke('#FFEBCD', '#000000');
        doc.rect(colPositions.formaPago, currentY, colWidths.formaPago, subtotalRowHeight).fillAndStroke('#FFEBCD', '#000000');
        doc.rect(colPositions.agente, currentY, colWidths.agente, subtotalRowHeight).fillAndStroke('#FFEBCD', '#000000');
        doc.rect(colPositions.de, currentY, colWidths.de, subtotalRowHeight).fillAndStroke('#FFEBCD', '#000000');
        doc.rect(colPositions.hacia, currentY, colWidths.hacia, subtotalRowHeight).fillAndStroke('#FFEBCD', '#000000');
        doc.rect(colPositions.fechaSalida, currentY, colWidths.fechaSalida, subtotalRowHeight).fillAndStroke('#FFEBCD', '#000000');
        doc.rect(colPositions.autobus, currentY, colWidths.autobus, subtotalRowHeight).fillAndStroke('#FFEBCD', '#000000');
        doc.rect(colPositions.pasajero, currentY, colWidths.pasajero, subtotalRowHeight).fillAndStroke('#FFEBCD', '#000000');
        doc.rect(colPositions.fechaVenta, currentY, colWidths.fechaVenta, subtotalRowHeight).fillAndStroke('#FFEBCD', '#000000');
        doc.rect(colPositions.precioUS, currentY, colWidths.precioUS, subtotalRowHeight).fillAndStroke('#FFEBCD', '#000000');
        doc.rect(colPositions.precioMX, currentY, colWidths.precioMX, subtotalRowHeight).fillAndStroke('#FFEBCD', '#000000');
        doc.rect(colPositions.cantidad, currentY, colWidths.cantidad, subtotalRowHeight).fillAndStroke('#FFEBCD', '#000000');
        
        doc.fontSize(8).font('Helvetica-Bold').fillColor('black');
        doc.text('Total', colPositions.agente + 2, currentY + 4, { width: colWidths.agente - 4 })
           .text(`$${subtotalUS.toFixed(2)}`, colPositions.precioUS + 2, currentY + 4, { width: colWidths.precioUS - 4, align: 'right' })
           .text(`$${subtotalMX.toFixed(2)}`, colPositions.precioMX + 2, currentY + 4, { width: colWidths.precioMX - 4, align: 'right' })
           .text(subtotalCount.toString(), colPositions.cantidad + 2, currentY + 4, { width: colWidths.cantidad, align: 'center' });

        currentY += subtotalRowHeight;
      }
    }
  }

  // Finalize PDF
  doc.end();
};

export const getDriversReportDownload = async (req: Request, res: Response) => {
  try {
    const {
      fromDate,
      toDate,
      driverId,
      format = 'excel' // 'excel' or 'pdf'
    } = req.query;

    // Set default dates if not provided
    const startDate = fromDate 
      ? new Date(new Date(fromDate as string).setHours(0, 0, 0, 0))
      : new Date(new Date().setDate(new Date().getDate() - 7));
    
    const endDate = toDate
      ? new Date(new Date(toDate as string).setHours(23, 59, 59, 999))
      : new Date(new Date().setHours(23, 59, 59, 999));

    // Build query for driver reports
    const query: any = {};

    // Date filtering
    query.tripDate = { $gte: startDate, $lte: endDate };

    // Driver filter - check both mxDriver and usDriver
    if (driverId) {
      query.$or = [
        { mxDriver: driverId },
        { usDriver: driverId }
      ];
    }

    // Fetch driver reports
    const reports = await DriverReport.find(query)
      .populate({
        path: 'mxDriver',
        select: 'profile',
        populate: {
          path: 'profile',
          select: 'firstName secondName lastName'
        }
      })
      .populate({
        path: 'usDriver',
        select: 'profile',
        populate: {
          path: 'profile',
          select: 'firstName secondName lastName'
        }
      })
      .populate('bus', 'serialNumber code')
      .populate('origin', 'name')
      .populate('destination', 'name')
      .sort({ tripDate: 1, tripTime: 1 });

    // Generate report based on format
    if (format === 'pdf') {
      return await generateDriversPDFReport(res, reports, startDate, endDate);
    } else {
      return await generateDriversExcelReport(res, reports, startDate, endDate);
    }

  } catch (err) {
    if (err instanceof CustomError)
      return ResponseUtil.errorResponse(res, err.statusCode, err.message);
    ResponseUtil.handleError(res, err);
  }
};

// Helper function to generate Drivers Excel report
const generateDriversExcelReport = async (
  res: Response,
  reports: any[],
  startDate: Date,
  endDate: Date
) => {
  const ExcelJS = require('exceljs');
  const fs = require('fs');
  const path = require('path');
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('DriversReport');

  // Set column widths
  worksheet.columns = [
    { width: 15 }, // Bus Number
    { width: 35 }, // Route Name
    { width: 15 }, // Trip Date
    { width: 12 }, // Trip Time
    { width: 25 }, // MX Driver
    { width: 25 }, // US Driver
    { width: 12 }  // Passengers
  ];

  // Add empty row for logo space
  const logoRow = worksheet.addRow([]);
  logoRow.height = 50;
  // Add logo image
  try {
    const logoPath = path.join(process.cwd(), 'public', 'uploads', 'logo.png');
    if (fs.existsSync(logoPath)) {
      const imageId = workbook.addImage({
        filename: logoPath,
        extension: 'png',
      });
      worksheet.addImage(imageId, {
        tl: { col: 0, row: 0 },
        ext: { width: 180, height: 80 }
      });
    }
  } catch (error) {
    console.error('Error adding logo to Excel:', error);
  }

  // Add title in the same row as logo (to the right)
  worksheet.getCell('C1').value = `Drivers Report From ${startDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })} To ${endDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}`;
  worksheet.mergeCells('C1:G1');
  worksheet.getCell('C1').font = { bold: true, size: 12, name: 'Calibri' };
  worksheet.getCell('C1').alignment = { horizontal: 'left', vertical: 'middle' };

  // Add empty row
  worksheet.addRow([]);

  // Add headers
  const headerRow = worksheet.addRow([
    'Bus Number',
    'Route Name',
    'Trip Date',
    'Trip Time',
    'MX Driver',
    'US Driver',
    'Passangers'
  ]);
  headerRow.font = { bold: true, name: 'Calibri', size: 10 };
  headerRow.eachCell((cell: any) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9D9D9' }
    };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Add data rows
  for (const report of reports) {
    const mxDriver = report.mxDriver?.profile
      ? `${report.mxDriver.profile.firstName || ''} ${report.mxDriver.profile.secondName || ''} ${report.mxDriver.profile.lastName || ''}`.trim()
      : '';

    const usDriver = report.usDriver?.profile
      ? `${report.usDriver.profile.firstName || ''} ${report.usDriver.profile.secondName || ''} ${report.usDriver.profile.lastName || ''}`.trim()
      : '';

    const tripDate = new Date(report.tripDate);
    const formattedDate = `${(tripDate.getMonth() + 1).toString().padStart(2, '0')}/${tripDate.getDate().toString().padStart(2, '0')}/${tripDate.getFullYear()}`;

    const row = worksheet.addRow([
      (report.bus as any)?.code || (report.bus as any)?.serialNumber || '',
      report.routeName || `${(report.origin as any)?.name || ''} ${(report.destination as any)?.name || ''}`,
      formattedDate,
      report.tripTime || '',
      mxDriver,
      usDriver,
      report.passengers || 0
    ]);

    // Add formatting
    row.font = { name: 'Calibri', size: 10 };
    
    // Add borders to all cells
    row.eachCell((cell: any) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  }

  // Set response headers
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=DriversReport-${startDate.toISOString().split('T')[0]}-${endDate.toISOString().split('T')[0]}.xlsx`
  );

  // Write to response
  await workbook.xlsx.write(res);
  res.end();
};

// Helper function to generate Drivers PDF report
const generateDriversPDFReport = async (
  res: Response,
  reports: any[],
  startDate: Date,
  endDate: Date
) => {
  const PDFDocument = require('pdfkit');
  const fs = require('fs');
  const path = require('path');
  const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });

  // Set response headers
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=DriversReport-${startDate.toISOString().split('T')[0]}-${endDate.toISOString().split('T')[0]}.pdf`
  );

  // Pipe PDF to response
  doc.pipe(res);

  // Add logo
  try {
    const logoPath = path.join(process.cwd(), 'public', 'uploads', 'logo.png');
    if (fs.existsSync(logoPath)) {
      // Center the logo on the page
      const logoWidth = 150;
      const logoHeight = 50;
      // Landscape A4: width = 841.89, so (841.89 - logoWidth) / 2 ≈ 345.95
      const pageWidth = doc.page.width;
      const xPos = (pageWidth - logoWidth) / 2;
      doc.image(logoPath, xPos, 20, { width: logoWidth, height: logoHeight });
    }
  } catch (error) {
    console.error('Error adding logo to PDF:', error);
  }

  // Add title (positioned below logo)
  doc.fontSize(14).font('Helvetica-Bold')
    .fillColor('black')
    .text(
      `Drivers Report From ${startDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })} To ${endDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}`,
      30, 80,
      { align: 'left' }
    );
  
  doc.moveDown(1.5);

  // Table column positions and widths
  const tableTop = doc.y;
  const colPositions = {
    busNumber: 30,
    routeName: 110,
    tripDate: 290,
    tripTime: 380,
    mxDriver: 450,
    usDriver: 590,
    passengers: 730
  };

  const colWidths = {
    busNumber: 80,
    routeName: 180,
    tripDate: 90,
    tripTime: 70,
    mxDriver: 140,
    usDriver: 140,
    passengers: 60
  };

  // Draw table header
  const drawTableHeader = (y: number) => {
    doc.fontSize(9).font('Helvetica-Bold').fillColor('black');
    
    const headerHeight = 20;
    
    // Draw header background and cells with borders
    doc.rect(colPositions.busNumber, y, colWidths.busNumber, headerHeight).fillAndStroke('#D9D9D9', '#000000');
    doc.rect(colPositions.routeName, y, colWidths.routeName, headerHeight).fillAndStroke('#D9D9D9', '#000000');
    doc.rect(colPositions.tripDate, y, colWidths.tripDate, headerHeight).fillAndStroke('#D9D9D9', '#000000');
    doc.rect(colPositions.tripTime, y, colWidths.tripTime, headerHeight).fillAndStroke('#D9D9D9', '#000000');
    doc.rect(colPositions.mxDriver, y, colWidths.mxDriver, headerHeight).fillAndStroke('#D9D9D9', '#000000');
    doc.rect(colPositions.usDriver, y, colWidths.usDriver, headerHeight).fillAndStroke('#D9D9D9', '#000000');
    doc.rect(colPositions.passengers, y, colWidths.passengers, headerHeight).fillAndStroke('#D9D9D9', '#000000');
    
    // Draw header text
    doc.fillColor('black')
       .text('Bus Number', colPositions.busNumber + 2, y + 6, { width: colWidths.busNumber - 4, align: 'center' })
       .text('Route Name', colPositions.routeName + 2, y + 6, { width: colWidths.routeName - 4, align: 'center' })
       .text('Trip Date', colPositions.tripDate + 2, y + 6, { width: colWidths.tripDate - 4, align: 'center' })
       .text('Trip Time', colPositions.tripTime + 2, y + 6, { width: colWidths.tripTime - 4, align: 'center' })
       .text('MX Driver', colPositions.mxDriver + 2, y + 6, { width: colWidths.mxDriver - 4, align: 'center' })
       .text('US Driver', colPositions.usDriver + 2, y + 6, { width: colWidths.usDriver - 4, align: 'center' })
       .text('Passangers', colPositions.passengers + 2, y + 6, { width: colWidths.passengers - 4, align: 'center' });
    
    return y + headerHeight;
  };

  let currentY = drawTableHeader(tableTop);

  // Add data rows
  for (const report of reports) {
    // Check if we need a new page
    if (currentY > 520) {
      doc.addPage();
      currentY = drawTableHeader(30);
    }

    const mxDriver = report.mxDriver?.profile
      ? `${report.mxDriver.profile.firstName || ''} ${report.mxDriver.profile.secondName || ''} ${report.mxDriver.profile.lastName || ''}`.trim()
      : '';

    const usDriver = report.usDriver?.profile
      ? `${report.usDriver.profile.firstName || ''} ${report.usDriver.profile.secondName || ''} ${report.usDriver.profile.lastName || ''}`.trim()
      : '';

    const tripDate = new Date(report.tripDate);
    const formattedDate = `${(tripDate.getMonth() + 1).toString().padStart(2, '0')}/${tripDate.getDate().toString().padStart(2, '0')}/${tripDate.getFullYear()}`;

    const rowHeight = 18;
    
    // Draw individual cell borders
    doc.rect(colPositions.busNumber, currentY, colWidths.busNumber, rowHeight).stroke('#000000');
    doc.rect(colPositions.routeName, currentY, colWidths.routeName, rowHeight).stroke('#000000');
    doc.rect(colPositions.tripDate, currentY, colWidths.tripDate, rowHeight).stroke('#000000');
    doc.rect(colPositions.tripTime, currentY, colWidths.tripTime, rowHeight).stroke('#000000');
    doc.rect(colPositions.mxDriver, currentY, colWidths.mxDriver, rowHeight).stroke('#000000');
    doc.rect(colPositions.usDriver, currentY, colWidths.usDriver, rowHeight).stroke('#000000');
    doc.rect(colPositions.passengers, currentY, colWidths.passengers, rowHeight).stroke('#000000');

    // Draw cell content
    doc.fontSize(8).font('Helvetica').fillColor('black');
    
    doc.text((report.bus as any)?.code || (report.bus as any)?.serialNumber || '', colPositions.busNumber + 2, currentY + 5, { width: colWidths.busNumber - 4 })
       .text(report.routeName || `${(report.origin as any)?.name || ''} ${(report.destination as any)?.name || ''}`, colPositions.routeName + 2, currentY + 5, { width: colWidths.routeName - 4 })
       .text(formattedDate, colPositions.tripDate + 2, currentY + 5, { width: colWidths.tripDate - 4 })
       .text(report.tripTime || '', colPositions.tripTime + 2, currentY + 5, { width: colWidths.tripTime - 4 })
       .text(mxDriver, colPositions.mxDriver + 2, currentY + 5, { width: colWidths.mxDriver - 4 })
       .text(usDriver, colPositions.usDriver + 2, currentY + 5, { width: colWidths.usDriver - 4 })
       .text((report.passengers || 0).toString(), colPositions.passengers + 2, currentY + 5, { width: colWidths.passengers - 4, align: 'center' });

    currentY += rowHeight;
  }

  // Finalize PDF
  doc.end();
};

