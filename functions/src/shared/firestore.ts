import * as admin from "firebase-admin";

export function getAdminApp() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.app();
}

export function db() {
  getAdminApp();
  return admin.firestore();
}

export const FieldValue = admin.firestore.FieldValue;
