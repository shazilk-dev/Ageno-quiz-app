import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const initFirebaseAdmin = () => {
  const apps = getApps();

  if (!apps.length) {
    try {
      // Get all environment variables
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(
        /\\n/g,
        "\n"
      ); // Direct replacement of escaped newlines

      // Check if we have all the required credentials
      if (!projectId || !clientEmail || !privateKey) {
        console.error("Firebase admin credentials missing:", {
          hasProjectId: !!projectId,
          hasClientEmail: !!clientEmail,
          hasPrivateKey: !!privateKey,
        });
        throw new Error("Firebase admin credentials are missing or incomplete");
      }

      // Initialize the app with the service account credentials
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });

    } catch (error) {
      console.error("Failed to initialize Firebase Admin:", error);
      throw error; // Rethrow to fail fast if we can't initialize Firebase
    }
  }

  return {
    auth: getAuth(),
    db: getFirestore(),
  };
};

export const { auth, db } = initFirebaseAdmin();
