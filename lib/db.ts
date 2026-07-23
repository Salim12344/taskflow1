import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

declare global {
  var _mongooseConn: Promise<typeof mongoose> | undefined;
}

export function connectDB() {
  if (!MONGODB_URI) throw new Error("MONGODB_URI is not set");
  if (!global._mongooseConn) {
    global._mongooseConn = mongoose.connect(MONGODB_URI);
  }
  return global._mongooseConn;
}
