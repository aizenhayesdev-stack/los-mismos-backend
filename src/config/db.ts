import mongoose, { Connection } from "mongoose";
import { DB_URI } from "./environment";

let databaseInstance: Connection | null = null;

export const connectDB = async (): Promise<void> => {
  try {
    mongoose.set('strictQuery', true);

    const connection = await mongoose.connect(DB_URI as string);
    databaseInstance = connection.connection;

    console.log("MongoDB Connected...");
  } catch (err: any) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
};

export const getDatabaseInstance = (): Connection | null => {
  return databaseInstance;
};

export default connectDB;
