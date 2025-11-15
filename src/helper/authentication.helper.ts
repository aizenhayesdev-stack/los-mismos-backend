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
}

export default AuthenticationHelper;
