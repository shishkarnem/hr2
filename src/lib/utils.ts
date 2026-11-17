import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isPngImage(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  const clean = url.split("?")[0].toLowerCase().trim();
  return clean.endsWith(".png") || clean.includes("image/png") || clean.includes(".png") || clean.startsWith("data:image/png");
}
