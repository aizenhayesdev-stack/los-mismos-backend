import { config } from "dotenv";
config();

export const {
  PORT,
  DB_URI,
  API_PREFIX,
  S3_BUCKET_NAME,
  AWS_REGION,
  AWS_ACCESS_KEY,
  AWS_SECRET_ACCESS_KEY,
  JWT_SECRET,
  BEARER_TOKEN,
  SALT_ROUNDS,
  EXPIRES_IN,
  MAIL_USERNAME,
  MAIL_FROM_NAME,
  MAIL_HOST,
  MAIL_PASSWORD,
  UPLOADS_URL,
  OTP_EXPIRY_SECONDS,
  rpID,
  rpName,
  rpOrigin,
  ENVIRONMENT,
  REDIS_HOST,
  REDIS_PORT,
  CLIENT_URL,
  SEAT_HOLD_DURATION,
  REDIS_URL,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  FCM_ENABLED
} = process.env;

// FCM Configuration Helper
export interface FCMConfig {
  enabled: boolean;
  isConfigured: boolean;
}

export function getFCMConfig(): FCMConfig {
  // Default to enabled if not specified
  const enabled = FCM_ENABLED !== 'false' && FCM_ENABLED !== '0';
  
  return {
    enabled,
    isConfigured: enabled
  };
}
