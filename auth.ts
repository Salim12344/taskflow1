import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import User from "@/models/User";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        await connectDB();
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          accountType: user.accountType,
        };
      },
    }),
    Google,
  ],
  callbacks: {
    // Google sign-in always creates/attaches an Individual account (spec: no org signup via OAuth)
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;

      await connectDB();
      let existing = await User.findOne({ email: user.email!.toLowerCase() });
      if (!existing) {
        existing = await User.create({
          email: user.email!.toLowerCase(),
          name: user.name ?? user.email,
          accountType: "individual",
        });
      }
      user.id = existing._id.toString();
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        await connectDB();
        const dbUser = await User.findById(user.id);
        token.accountType = dbUser?.accountType;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.accountType = token.accountType as "individual" | "organization";
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
