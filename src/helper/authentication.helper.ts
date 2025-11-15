import { randomInt } from "crypto";
import {
  Document,
  Model,
  FilterQuery,
  PopulateOptions,
  PipelineStage,
} from "mongoose";
import { OtpModel } from "../models/otp.model";
import { emailTemplateGeneric } from "../utils/SendEmail/templates";
import { sendEmail } from "../utils/SendEmail";
import { AUTH_CONSTANTS } from "../constants/messages";
import { OtpTypes } from "../models";
import fs from 'fs';
import path from 'path';
import axios from 'axios';

class AuthenticationHelper {
  async sendOTP(
    email: string,
    userId: object,
    type: OtpTypes,
    otp?: number
  ) {
    try {
      if(!otp){
        otp = randomInt(100000, 999999);
      }
      await OtpModel.deleteMany({
        userId: userId,
      });
      await OtpModel.create({
        userId: userId,
        otp: String(otp),
      });
      const template = emailTemplateGeneric(otp, type);
      await sendEmail(email, AUTH_CONSTANTS.VERIFICATION_CODE, template);
    } catch (error) {
      console.error("Error sending otp:", error);
      throw new Error("Failed to send OTP");
    }
  }

  static async downloadAndSaveImage(imageUrl: string, destinationDir: string): Promise<string | null> {
        if (!imageUrl) return null;

        const fileName: string = `${crypto.randomUUID()}.jpg`;
        const filePath: string = path.join(destinationDir, fileName);

        try {
            // Ensure the destination directory exists
            if (!fs.existsSync(destinationDir)) {
                fs.mkdirSync(destinationDir, { recursive: true });
            }

            const response = await axios.get<fs.ReadStream>(imageUrl, { responseType: 'stream' });

            return await new Promise((resolve, reject) => {
                const writer = fs.createWriteStream(filePath);
                response.data.pipe(writer);

                writer.on('finish', () => resolve(fileName)); // Return fileName instead of filePath
                writer.on('error', (error) => reject(`Error writing file: ${error.message}`));
            });
        } catch (error) {
            console.error('Error downloading or saving image:', (error as Error).message);
            return null;
        }
    }
}

export default AuthenticationHelper;
