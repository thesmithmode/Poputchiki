export function isAtOrAfterUtcTime(now: Date, hour: number, minute: number): boolean {
  return now.getUTCHours() * 60 + now.getUTCMinutes() >= hour * 60 + minute;
}
