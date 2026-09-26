import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function app() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) throw new Error("Firebase Admin credentials are required in .env.local.");
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

export async function requireUser(request: Request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) throw new Error("Unauthorized");
  return getAuth(app()).verifyIdToken(token);
}
