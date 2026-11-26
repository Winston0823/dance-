import * as SecureStore from "expo-secure-store";
import type { ProjectDocument } from "../../../packages/core/src/index.ts";
export interface ProjectSummary {
  id: string;
  title: string;
  dancerCount: number;
  formationCount: number;
  publishedRevision: number | null;
  updatedAt: string;
}
export interface ProjectRecord {
  id: string;
  document: ProjectDocument;
  version: number;
  publishedRevision: number | null;
  updatedAt: string;
  role?: "editor" | "viewer";
}
export interface Note {
  id: string;
  beat: number;
  dancerId?: string;
  author: string;
  body: string;
  revision: number | null;
  createdAt: string;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Connection = { server: string; token: string };
export const readConnection = async (): Promise<Connection | null> => {
  const value = await SecureStore.getItemAsync("danceform.connection");
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};
export const storeConnection = (value: Connection) =>
  SecureStore.setItemAsync("danceform.connection", JSON.stringify(value));
export async function api<T>(
  connection: Connection,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const controller = options.signal ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), 20000) : null;
  try {
    const response = await fetch(connection.server.replace(/\/$/, "") + path, {
      credentials: "omit",
      ...options,
      signal: options.signal ?? controller?.signal,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(connection.token
          ? { Authorization: `Bearer ${connection.token}` }
          : {}),
        ...options.headers,
      },
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new ApiError(
        response.status,
        "Unexpected server response. Check the server address and connection.",
      );
    }
    if (!response.ok)
      throw new ApiError(response.status, result.error ?? "Request failed");
    return result;
  } catch (error) {
    if (controller?.signal.aborted)
      throw new ApiError(
        0,
        "Server timed out. Your local changes are still here; reconnect or retry saving.",
      );
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
