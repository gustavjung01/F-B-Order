export type FrontendDataMode = "static" | "backend";

export function getFrontendDataMode(): FrontendDataMode {
  const value = process.env.NEXT_PUBLIC_DATA_MODE?.trim().toLowerCase();
  if (value === "static" || value === "backend") return value;
  throw new Error("NEXT_PUBLIC_DATA_MODE must be explicitly set to static or backend");
}

export function requireBackendMode(): void {
  if (getFrontendDataMode() !== "backend") {
    throw new Error("This operation is disabled while NEXT_PUBLIC_DATA_MODE=static");
  }
}
