import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    console.log("REGISTER BODY:", body);

    const { email, password, name, role } = body as {
      email?: string;
      password?: string;
      name?: string;
      role?: string;
    };

    if (!email || !password) {
      return NextResponse.json(
        { error: "Missing email or password" },
        { status: 400 },
      );
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        password: hashed,
        name: name || null,
        role: (role || "uzivatel").toLowerCase(),
      },
    });

    return NextResponse.json({ success: true, user });
  } catch (e: any) {
    console.error("REGISTER ERROR:", e);

    return NextResponse.json(
      {
        error: e?.message,
        code: e?.code,
        meta: e?.meta,
      },
      { status: 400 },
    );
  }
}
