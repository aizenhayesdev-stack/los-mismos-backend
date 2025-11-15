const QRCode = require('qrcode');

export interface BookingQRData {
  // note?: string;
  // bookingId?: string;
  // userId?: string;
  // routeId?: string;
  // busId?: string;
  // groupTicketSerial?: string;
  // passengers?: {
  //   fullName?: string;
  //   seatLabel?: string;
  //   ticketNumber?: string;
  //   gender?: string;
  //   dob?: string;
  //   contactNumber?: string;
  //   DocumentId?: string;
  // }[];
  // routeInfo?: {
  //   from?: string;
  //   to?: string;
  //   departureDate?: string;
  //   returnDate?: string;
  // };
  // paymentType?: string;
  // totalPrice?: number;
  // bookingDate?: string;
  ticketNumber?: string;
}

export class QRCodeUtils {
  /**
   * Generate QR code as base64 string
   * @param data - The data to encode in the QR code
   * @returns Promise<string> - Base64 encoded QR code image
   */
  static async generateQRCodeAsBase64(data: any): Promise<string> {
    try {
      const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(data), {
        errorCorrectionLevel: 'M',
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      return qrCodeDataURL;
    } catch (error) {
      throw new Error(`Failed to generate QR code: ${error}`);
    }
  }

  /**
   * Generate QR code as buffer
   * @param data - The data to encode in the QR code
   * @returns Promise<Buffer> - QR code image buffer
   */
  static async generateQRCodeAsBuffer(data: any): Promise<Buffer> {
    try {
      const qrCodeBuffer = await QRCode.toBuffer(JSON.stringify(data), {
        errorCorrectionLevel: 'M',
        type: 'png',
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      return qrCodeBuffer;
    } catch (error) {
      throw new Error(`Failed to generate QR code: ${error}`);
    }
  }

  /**
   * Create booking QR data structure
   * @param bookingData - Raw booking data
   * @returns BookingQRData - Structured data for QR code
   */
  static createBookingQRData(bookingData: {
    ticketNumber: string;
    userId?: string;
    routeId?: string;
    busId?: string;
    passengers?: any[];
    routeInfo?: any;
    paymentType?: string;
    totalPrice?: number;
    groupTicketSerial?: string;
  }): BookingQRData {
    // return {
    // // Show a user-friendly data structure for QR code for now
    //   note: "This QR code contains essential ticket, route, and passenger information for easy verification."
    // };
    return {
      ticketNumber: bookingData.ticketNumber,
      // bookingId: `BK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      // userId: bookingData.userId,
      // routeId: bookingData.routeId,
      // busId: bookingData.busId,
      // groupTicketSerial: bookingData.groupTicketSerial,
      // passengers: bookingData.passengers.map(passenger => ({
      //   fullName: passenger.fullName,
      //   seatLabel: passenger.seatLabel,
      //   ticketNumber: passenger.ticketNumber,
      //   gender: passenger.gender,
      //   dob: passenger.dob,
      //   contactNumber: passenger.contactNumber,
      //   DocumentId: passenger.DocumentId
      // })),
      // routeInfo: {
      //   from: bookingData.routeInfo.from,
      //   to: bookingData.routeInfo.to,
      //   departureDate: bookingData.routeInfo.departureDate,
      //   returnDate: bookingData.routeInfo.returnDate
      // },
      // paymentType: bookingData.paymentType,
      // totalPrice: bookingData.totalPrice,
      // bookingDate: new Date().toISOString()
    };
  }
}

