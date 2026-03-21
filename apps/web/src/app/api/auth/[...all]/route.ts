import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { POST, GET, DELETE, PATCH, PUT } = toNextJsHandler(auth);
