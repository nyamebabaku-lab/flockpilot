/** Stores Ghanaian numbers in one form: 0XXXXXXXXX. */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("233")) digits = `0${digits.slice(3)}`;
  return /^0\d{9}$/.test(digits) ? digits : null;
}
