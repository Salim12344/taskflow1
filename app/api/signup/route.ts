import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Organization from "@/models/Organization";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, password, name, accountType, orgName, regNumber } = body;

  if (!email || !password || !name || !accountType) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!["individual", "organization"].includes(accountType)) {
    return NextResponse.json({ error: "Invalid accountType" }, { status: 400 });
  }
  if (accountType === "organization") {
    if (!orgName) {
      return NextResponse.json({ error: "orgName is required for organization accounts" }, { status: 400 });
    }
    if (!/^\d{6}$/.test(regNumber ?? "")) {
      return NextResponse.json({ error: "regNumber must be exactly 6 digits" }, { status: 400 });
    }
  }

  await connectDB();

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  if (accountType === "organization") {
    const existingOrg = await Organization.findOne({ regNumber });
    if (existingOrg) {
      return NextResponse.json({ error: "That registration number is already in use by another organization" }, { status: 409 });
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    email: email.toLowerCase(),
    passwordHash,
    name,
    accountType,
  });

  let organization = null;
  if (accountType === "organization") {
    try {
      organization = await Organization.create({ name: orgName, regNumber, ownerId: user._id });
    } catch (err) {
      await User.deleteOne({ _id: user._id });
      if (err instanceof Error && "code" in err && err.code === 11000) {
        return NextResponse.json({ error: "That registration number is already in use by another organization" }, { status: 409 });
      }
      throw err;
    }
  }

  return NextResponse.json(
    {
      user: { id: user._id, email: user.email, name: user.name, accountType: user.accountType },
      organization: organization ? { id: organization._id, name: organization.name } : null,
    },
    { status: 201 }
  );
}
