import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guards a route param before it reaches Prisma. Local primary keys are `uuid`
 * columns, so a malformed `:id` segment makes Prisma throw a validation error
 * mid-render instead of letting the page call notFound() — check the shape first.
 */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
