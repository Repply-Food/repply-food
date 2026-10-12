import { format, parseISO } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export function agoraTz(fuso: string): Date {
  return toZonedTime(new Date(), fuso);
}

export function toZonedTimeDate(data: Date | string, fuso: string): Date {
  return toZonedTime(typeof data === "string" ? parseISO(data) : data, fuso);
}

export function formatDataCivil(fuso: string, data: Date | string): string {
  const zoned = toZonedTimeDate(data, fuso);
  return format(zoned, "yyyy-MM-dd");
}
