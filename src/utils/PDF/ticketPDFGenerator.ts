const PDFDocument = require('pdfkit');
import { IPassenger } from '../../models/passenger.models';
import { QRCodeUtils, BookingQRData } from '../QRCode';

export interface TicketPDFData {
  passenger: IPassenger;
  routeInfo: {
    from: string;
    to: string;
    departureDate: Date;
    returnDate?: Date;
  };
  busInfo?: {
    busNumber: string;
    driverName?: string;
  };
  companyInfo: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    logo?: string;
  };
}

export class TicketPDFGenerator {
  private doc: any;
  private pageWidth: number;
  private pageHeight: number;

  constructor() {
    this.doc = new PDFDocument({ 
      size: 'A4',
      margins: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0
      }
    });
    this.pageWidth = 595;
    this.pageHeight = 842;
  }

  async generateTicket(ticketData: TicketPDFData): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const chunks: Buffer[] = [];
        
        this.doc.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        
        this.doc.on('end', () => {
          const pdfBuffer = Buffer.concat(chunks as readonly Uint8Array[]);
          resolve(pdfBuffer);
        });

        this.doc.on('error', (error: Error) => {
          reject(error);
        });

        await this.createTicketContent(ticketData);
        this.doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private async createTicketContent(data: TicketPDFData): Promise<void> {
    const { passenger, routeInfo, busInfo, companyInfo } = data;
    
    this.createHeader(companyInfo);
    this.createTicketTitle(passenger.ticketNumber);
    this.createRouteSection(routeInfo, passenger.seatLabel);
    this.createInformationGrid(passenger, busInfo, routeInfo);
    await this.createQRCodeSection(passenger, routeInfo, busInfo);
    this.createFooter(companyInfo);
  }

  private createHeader(companyInfo: any): void {
    const headerHeight = 70;
    
    // Purple header background
    this.doc.rect(0, 0, this.pageWidth, headerHeight)
           .fill('#4B3D9D');
    
    // Decorative dots pattern
    this.doc.opacity(0.08);
    for (let i = 0; i < this.pageWidth; i += 25) {
      for (let j = 0; j < headerHeight; j += 25) {
        this.doc.circle(i + 5, j + 5, 1.5).fill('#FCD34D');
      }
    }
    this.doc.opacity(1);
    
    // Logo area - increased size
    const logoPath = './public/uploads/logo.png';
    try {
      this.doc.image(logoPath, 35, 15, { 
        width: 120, 
        height: 120,
        fit: [120, 120]
      });
    } catch (error) {
      // Create text-based logo fallback with larger size
      this.doc.roundedRect(35, 15, 60, 60, 5)
             .fillAndStroke('#ffffff', '#FCD34D');
      
      const initials = companyInfo.name.split(' ')
        .map((word: string) => word.charAt(0))
        .join('')
        .substring(0, 2)
        .toUpperCase();
      
      this.doc.fillColor('#4B3D9D')
             .fontSize(24)
             .font('Helvetica-Bold')
             .text(initials, 60, 35, { width: 60, align: 'center' });
    }
    
    // Company name
    this.doc.fillColor('#ffffff')
           .fontSize(28)
           .font('Helvetica-Bold')
           .text(companyInfo.name, 160, 28);
    
    // Yellow accent line
    this.doc.rect(0, headerHeight, this.pageWidth, 4)
           .fill('#FCD34D');
    
    this.doc.y = headerHeight + 25;
  }

  private createTicketTitle(ticketNumber: string): void {
    const startY = this.doc.y;
    
    // "BUS TICKET" title
    this.doc.fillColor('#1F2937')
           .fontSize(28)
           .font('Helvetica-Bold')
           .text('BUS TICKET', 0, startY, { align: 'center' });
    
    this.doc.moveDown(0.5);
    
    // Ticket number badge
    const badgeWidth = 200;
    const badgeHeight = 32;
    const badgeX = (this.pageWidth - badgeWidth) / 2;
    const badgeY = this.doc.y;
    
    this.doc.rect(badgeX, badgeY, badgeWidth, badgeHeight)
           .fill('#4B3D9D');
    
    this.doc.fillColor('#ffffff')
           .fontSize(13)
           .font('Helvetica-Bold')
           .text(`TICKET #${ticketNumber}`, badgeX, badgeY + 9, { 
             width: badgeWidth, 
             align: 'center' 
           });
    
    this.doc.y = badgeY + badgeHeight + 20;
  }

  private createRouteSection(routeInfo: any, seatLabel: string): void {
    const sectionY = this.doc.y;
    const sectionHeight = 85;
    const sectionX = 35;
    const sectionWidth = this.pageWidth - 70;
    
    // Container with 2px border
    this.doc.lineWidth(2);
    this.doc.rect(sectionX, sectionY, sectionWidth, sectionHeight)
           .fillAndStroke('#FEF3C7', '#F59E0B');
    
    // FROM section
    this.doc.fillColor('#78716C')
           .fontSize(9)
           .font('Helvetica-Bold')
           .text('FROM', sectionX + 20, sectionY + 12);
    
    this.doc.fillColor('#1F2937')
           .fontSize(18)
           .font('Helvetica-Bold')
           .text(routeInfo.from, sectionX + 20, sectionY + 26, { width: 130 });
    
    // // Arrow only (no exclamation mark)
    this.doc.fillColor('#4B3D9D')
           .fontSize(24)
           .font('Helvetica-Bold')
           .text('===>', this.pageWidth / 2 - 20, sectionY + 22);
    
    // TO section
    this.doc.fillColor('#78716C')
           .fontSize(9)
           .font('Helvetica-Bold')
           .text('TO', this.pageWidth - 170, sectionY + 12);
    
    this.doc.fillColor('#1F2937')
           .fontSize(18)
           .font('Helvetica-Bold')
           .text(routeInfo.to, this.pageWidth - 170, sectionY + 26, { width: 130 });
    
    // Seat badge
    const seatBadgeWidth = 90;
    const seatBadgeX = (this.pageWidth - seatBadgeWidth) / 2;
    
    this.doc.rect(seatBadgeX, sectionY + 55, seatBadgeWidth, 24)
           .fill('#4B3D9D');
    
    this.doc.fillColor('#ffffff')
           .fontSize(13)
           .font('Helvetica-Bold')
           .text(`SEAT ${seatLabel}`, seatBadgeX, sectionY + 60, {
             width: seatBadgeWidth,
             align: 'center'
           });
    
    // Date/time info below section
    this.doc.y = sectionY + sectionHeight + 10;
    
    this.doc.fillColor('#1F2937')
           .fontSize(10)
           .font('Helvetica-Bold')
           .text(`Departure: ${routeInfo.departureDate.toLocaleDateString()} at ${routeInfo.departureDate.toLocaleTimeString()}`, 
                 0, this.doc.y, { align: 'center' });
    
    if (routeInfo.returnDate) {
      this.doc.moveDown(0.3);
      this.doc.text(`Return: ${routeInfo.returnDate.toLocaleDateString()} at ${routeInfo.returnDate.toLocaleTimeString()}`, 
                    { align: 'center' });
    }
    
    this.doc.moveDown(0.8);
  }

  private createInformationGrid(passenger: any, busInfo: any, routeInfo: any): void {
    const gridY = this.doc.y;
    const columnWidth = 225;
    const leftX = 45;
    const rightX = this.pageWidth - leftX - columnWidth;
    const boxHeight = 130;
    
    // Passenger Details Box with 2px border
    this.doc.lineWidth(2);
    this.doc.rect(leftX, gridY, columnWidth, boxHeight)
           .fillAndStroke('#ffffff', '#4B3D9D');
    
    this.doc.fillColor('#1F2937')
           .fontSize(12)
           .font('Helvetica-Bold')
           .text('PASSENGER DETAILS', leftX + 12, gridY + 12);
    
    const passengerInfo = [
      { label: 'FULL NAME', value: passenger.fullName },
      { label: 'GENDER', value: passenger.gender },
      { label: 'CONTACT', value: passenger.contactNumber },
      { label: 'DOCUMENT ID', value: passenger.DocumentId || 'N/A' }
    ];
    
    let itemY = gridY + 33;
    passengerInfo.forEach(item => {
      this.createInfoRow(item.label, item.value, leftX + 12, itemY, columnWidth - 24);
      itemY += 24;
    });
    
    // Bus Details Box (if available)
    if (busInfo) {
      this.doc.lineWidth(2);
      this.doc.rect(rightX, gridY, columnWidth, boxHeight)
             .fillAndStroke('#ffffff', '#4B3D9D');
      
      this.doc.fillColor('#1F2937')
             .fontSize(12)
             .font('Helvetica-Bold')
             .text('BUS DETAILS', rightX + 12, gridY + 12);
      
      const busDetails = [
        { label: 'BUS NUMBER', value: busInfo.busNumber },
        { label: 'DRIVER', value: busInfo.driverName || 'TBA' },
        { label: 'ROUTE TYPE', value: routeInfo.returnDate ? 'Round Trip' : 'One Way' },
        { label: 'BOOKING DATE', value: new Date().toLocaleDateString() }
      ];
      
      itemY = gridY + 33;
      busDetails.forEach(item => {
        this.createInfoRow(item.label, item.value, rightX + 12, itemY, columnWidth - 24);
        itemY += 21;
      });
    }
    
    this.doc.y = gridY + boxHeight + 20;
  }

  private createInfoRow(label: string, value: string, x: number, y: number, width: number): void {
    // Label
    this.doc.fillColor('#78716C')
           .fontSize(8)
           .font('Helvetica-Bold')
           .text(label, x, y);
    
    // Value
    this.doc.fillColor('#1F2937')
           .fontSize(11)
           .font('Helvetica-Bold')
           .text(value, x, y + 11, { width: width, ellipsis: true });
  }

  private async createQRCodeSection(passenger: any, routeInfo: any, busInfo: any): Promise<void> {
    const qrY = this.doc.y;
    const qrSize = 130;
    const qrX = (this.pageWidth - qrSize) / 2;
    const containerPadding = 25;
    const containerWidth = qrSize + (containerPadding * 2);
    const containerHeight = qrSize + 75;
    const containerX = (this.pageWidth - containerWidth) / 2;
    
    // QR container with 2px border
    this.doc.lineWidth(2);
    this.doc.rect(containerX, qrY, containerWidth, containerHeight)
           .fillAndStroke('#FEF3C7', '#F59E0B');
    
    // Title
    this.doc.fillColor('#1F2937')
           .fontSize(12)
           .font('Helvetica-Bold')
           .text('VERIFICATION CODE', containerX, qrY + 15, {
             width: containerWidth,
             align: 'center'
           });
    
    // Generate QR code
    const qrCodeData = this.createQRCodeData(passenger, routeInfo, busInfo);
    
    try {
      const qrCodeBuffer = await QRCodeUtils.generateQRCodeAsBuffer(qrCodeData);
      
      // White background for QR with 2px border
      this.doc.lineWidth(2);
      this.doc.rect(qrX, qrY + 38, qrSize, qrSize)
             .fillAndStroke('#ffffff', '#4B3D9D');
      
      this.doc.image(qrCodeBuffer, qrX + 4, qrY + 42, { 
        width: qrSize - 8, 
        height: qrSize - 8 
      });
      
    } catch (error) {
      console.warn('QR code generation failed:', error);
      this.doc.lineWidth(2);
      this.doc.rect(qrX, qrY + 38, qrSize, qrSize)
             .fillAndStroke('#FEE2E2', '#EF4444');
      
      this.doc.fillColor('#DC2626')
             .fontSize(10)
             .font('Helvetica-Bold')
             .text('QR Code\nUnavailable', qrX, qrY + 38 + qrSize/2 - 12, {
               width: qrSize,
               align: 'center'
             });
    }
    
    // QR info
    this.doc.fillColor('#1F2937')
           .fontSize(10)
           .font('Helvetica-Bold')
           .text(`Ticket: ${passenger.ticketNumber}`, containerX, qrY + qrSize + 48, {
             width: containerWidth,
             align: 'center'
           });
    
    this.doc.fillColor('#78716C')
           .fontSize(8)
           .font('Helvetica')
           .text(`Seat: ${passenger.seatLabel} | Scan for verification`, containerX, qrY + qrSize + 61, {
             width: containerWidth,
             align: 'center'
           });
    
    this.doc.y = qrY + containerHeight + 15;
  }

  private createQRCodeData(passenger: IPassenger, routeInfo: any, busInfo: any): any {
    return {
      ticketNumber: passenger.ticketNumber,
      seatLabel: passenger.seatLabel,
      passengerName: passenger.fullName,
      contactNumber: passenger.contactNumber,
      from: routeInfo.from,
      to: routeInfo.to,
      departureDate: routeInfo.departureDate,
      returnDate: routeInfo.returnDate,
      busNumber: busInfo?.busNumber || 'N/A',
      documentId: passenger.DocumentId,
      groupTicketSerial: passenger.groupTicketSerial,
      generatedAt: new Date().toISOString(),
      type: 'BUS_TICKET_VERIFICATION'
    };
  }

  private createFooter(companyInfo: any): void {
    const footerY = this.pageHeight - 70;
    
    // Purple top border (2px)
    this.doc.rect(0, footerY, this.pageWidth, 2)
           .fill('#4B3D9D');
    
    // Footer background
    this.doc.rect(0, footerY + 2, this.pageWidth, 68)
           .fill('#000000');
    
    const terms = [
      '• Arrive 15 min before departure',
      '• Valid ID required',
      '• No refunds for no-shows'
    ];
    
    // Terms in single row
    let termX = 40;
    terms.forEach((term) => {
      this.doc.fillColor('#E5E7EB')
             .fontSize(8)
             .font('Helvetica')
             .text(term, termX, footerY + 15);
      termX += 175;
    });
    
    // Ticket info at bottom
    const ticketInfo = `Ticket: TKT-${Date.now().toString().slice(-8)}`;
    this.doc.fillColor('#9CA3AF')
           .fontSize(8)
           .font('Helvetica')
           .text(ticketInfo, 0, footerY + 38, { align: 'center' });
    
    // Copyright
    this.doc.fillColor('#6B7280')
           .fontSize(8)
           .text(`© ${new Date().getFullYear()} ${companyInfo.name}. All rights reserved.`, 0, footerY + 52, {
             align: 'center'
           });
  }

  async generateMultipleTickets(ticketsData: TicketPDFData[]): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const chunks: Buffer[] = [];
        
        this.doc.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        
        this.doc.on('end', () => {
          const pdfBuffer = Buffer.concat(chunks as readonly Uint8Array[]);
          resolve(pdfBuffer);
        });

        this.doc.on('error', (error: Error) => {
          reject(error);
        });

        for (let index = 0; index < ticketsData.length; index++) {
          if (index > 0) {
            this.doc.addPage();
          }
          await this.createTicketContent(ticketsData[index]);
        }
        
        this.doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}