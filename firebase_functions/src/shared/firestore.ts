import * as admin from "firebase-admin";

export function getAdminApp(): admin.app.App {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.app();
}

export function db(): admin.firestore.Firestore {
  getAdminApp();
  return admin.firestore();
}

export const FieldValue = admin.firestore.FieldValue;
