import { setServers } from "node:dns";
import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI;
/** Only set when you need to override system DNS (e.g. querySrv failures). */
const dnsServersEnv = process.env.MONGODB_DNS_SERVERS?.trim();

declare global {
  var mongoClientPromise: Promise<MongoClient> | undefined;
}

export async function getDb(): Promise<Db> {
  if (!uri) {
    throw new Error("MONGODB_URI is required.");
  }

  if (uri.startsWith("mongodb+srv://") && dnsServersEnv) {
    setServers(
      dnsServersEnv
        .split(",")
        .map((server) => server.trim())
        .filter(Boolean),
    );
  }

  const clientPromise = global.mongoClientPromise ?? new MongoClient(uri).connect();

  if (process.env.NODE_ENV !== "production") {
    global.mongoClientPromise = clientPromise;
  }

  try {
    const connectedClient = await clientPromise;
    return connectedClient.db();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      global.mongoClientPromise = undefined;
    }

    throw error;
  }
}
