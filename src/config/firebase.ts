import * as admin from 'firebase-admin';
import path from 'path';
import { getFCMConfig } from './environment';

// Initialize Firebase Admin SDK
let firebaseApp: admin.app.App | null = null;
let fcmConfig = getFCMConfig();

export const initializeFirebase = () => {
  try {
    // Check if FCM is enabled
    if (!fcmConfig.enabled) {
      console.log('ℹ️ FCM is disabled via environment configuration - skipping Firebase initialization');
      return null;
    }

    if (!firebaseApp) {
      const serviceAccountPath = path.join(__dirname, 'los-mismos-staging-8432b3d3637a.json');
      
      const serviceAccount = require(serviceAccountPath);
      
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
        projectId: 'los-mismos-staging'
      });
      
      console.log('✅ Firebase Admin SDK initialized successfully');
    }
    return firebaseApp;
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin SDK:', error);
    throw error;
  }
};

export const getFirebaseApp = (): admin.app.App | null => {
  if (!fcmConfig.enabled) {
    return null;
  }
  
  if (!firebaseApp) {
    return initializeFirebase();
  }
  return firebaseApp;
};

export const getFirebaseMessaging = (): admin.messaging.Messaging | null => {
  if (!fcmConfig.enabled) {
    return null;
  }
  
  const app = getFirebaseApp();
  if (!app) {
    return null;
  }
  return admin.messaging(app);
};

// Safe wrapper function for Firebase messaging
export const getFirebaseMessagingSafe = (): admin.messaging.Messaging | null => {
  try {
    return getFirebaseMessaging();
  } catch (error) {
    console.error('Error getting Firebase messaging:', error);
    return null;
  }
};

// Export FCM status for other modules to check
export const isFCMEnabled = (): boolean => {
  return fcmConfig.enabled;
};

export default { initializeFirebase, getFirebaseApp, getFirebaseMessaging, getFirebaseMessagingSafe, isFCMEnabled };

