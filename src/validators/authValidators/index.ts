import { z, ZodSchema } from "zod";
import { DeviceType, Gender, UserRole } from "../../models";

export const signupSchema: ZodSchema<{
  email: string;
  password: string;
  role?: UserRole;
  deviceType: DeviceType;
  deviceToken: string;
}> = z.object({
  email: z.string().email("Invalid email format").max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(100),
  role: z
    .nativeEnum(UserRole, {
      errorMap: () => ({ message: `Invalid role` }),
    })
    .optional(),
  deviceType: z.nativeEnum(DeviceType, {
    errorMap: () => ({ message: `Invalid Device Type` }),
  }),
  deviceToken: z.string(),
});

export const loginSchema: ZodSchema<{
  email: string;
  password: string;
  deviceToken: string;
  deviceType: DeviceType;
}> = z.object({
  email: z.string().email("Invalid email format").max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(100),
  deviceType: z.nativeEnum(DeviceType, {
    errorMap: () => ({ message: `Invalid Device Type` }),
  }),
  deviceToken: z.string(),
});

export const otpVerifySchema: ZodSchema<{
  userId: string;
  otp: string;
}> = z.object({
  userId: z.string().min(1, "userId is required"),
  otp: z.string(),
});
export const emailSchema: ZodSchema<{
  email: string;
}> = z.object({
  email: z.string().email("Invalid email format").max(255),
});
export const passowrdSchema: ZodSchema<{
  password: string;
}> = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(100),
});
export const changePassowrdSchema: ZodSchema<{
  oldPassword: string;
  newPassword: string;
}> = z.object({
  oldPassword: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(100),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(100),
});

export const createProfileSchema: ZodSchema<{
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: Gender;
  emergencyContact: string;
  documentCode: string;
  documentNumber: string;
  documentIssuingCountry: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  phoneNumber: string;
}> = z.object({
  firstName: z.string().max(255),
  lastName: z.string().max(255),
  dateOfBirth: z.coerce.date({
    errorMap: () => ({ message: "Invalid date format" }),
  }),
  gender: z.nativeEnum(Gender, {
    errorMap: () => ({
      message: "Invalid gender. Must be male, female, other, or prefer_not_say",
    }),
  }),
  emergencyContact: z.string(),
  documentCode: z.string(),
  documentNumber: z.string(),
  documentIssuingCountry: z.string(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  phoneNumber: z.string(),
});

// Biometric Authentication Validators
export const verifyChallengeSchema: ZodSchema<{
  options: {
    id: string;
    rawId: string;
    response: {
      attestationObject: string;
      clientDataJSON: string;
    };
    type: string;
  };
  passkeyName?: string;
  deviceType?: string;
}> = z.object({
  options: z.object({
    id: z.string().min(1, "Credential ID is required"),
    rawId: z.string().min(1, "Raw ID is required"),
    response: z.object({
      attestationObject: z.string().min(1, "Attestation object is required"),
      clientDataJSON: z.string().min(1, "Client data JSON is required"),
    }),
    type: z.string().min(1, "Type is required"),
  }),
  passkeyName: z.string().max(100, "Passkey name too long").optional(),
  deviceType: z.string().max(50, "Device type too long").optional(),
});

export const verifyLoginChallengeSchema: ZodSchema<{
  options: {
    id: string;
    rawId: string;
    response: {
      authenticatorData: string;
      clientDataJSON: string;
      signature: string;
      userHandle?: string;
    };
    type: string;
  };
  deviceToken?: string;
  deviceType?: string;
}> = z.object({
  options: z.object({
    id: z.string().min(1, "Credential ID is required"),
    rawId: z.string().min(1, "Raw ID is required"),
    response: z.object({
      authenticatorData: z.string().min(1, "Authenticator data is required"),
      clientDataJSON: z.string().min(1, "Client data JSON is required"),
      signature: z.string().min(1, "Signature is required"),
      userHandle: z.string().optional(),
    }),
    type: z.string().min(1, "Type is required"),
  }),
  deviceToken: z.string().optional(),
  deviceType: z.string().max(50, "Device type too long").optional(),
});

export const updatePasskeyNameSchema: ZodSchema<{
  name: string;
}> = z.object({
  name: z
    .string()
    .min(1, "Passkey name is required")
    .max(100, "Passkey name too long")
    .regex(/^[a-zA-Z0-9\s\-_]+$/, "Passkey name contains invalid characters"),
});

export const updateProfileSchema: ZodSchema<{
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date;
  gender?: Gender;
  emergencyContact?: string;
  documentCode?: string;
  documentNumber?: string;
  documentIssuingCountry?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  phoneNumber?: string;
}> = z.object({
    firstName: z.string().max(255).optional(),
    lastName: z.string().max(255).optional(),
    dateOfBirth: z.coerce.date({
        errorMap: () => ({ message: "Invalid date format" }),
    }).optional(),
    gender: z.nativeEnum(Gender, {
        errorMap: () => ({
            message: "Invalid gender. Must be male, female, other, or prefer_not_say",
        }),
    }).optional(),
    emergencyContact: z.string().optional(),
    documentCode: z.string().optional(),
    documentNumber: z.string().optional(),
    documentIssuingCountry: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    phoneNumber: z.string().optional(),
});