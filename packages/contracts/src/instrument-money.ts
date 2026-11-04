export function parseInstrumentMinor(value: string, decimals: number) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 4)
    throw new Error("INVALID_AMOUNT");
  let normalized = value
    .trim()
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
  if (
    normalized.includes("٬") &&
    !/^\d{1,3}(?:٬\d{3})+(?:[.٫]\d+)?$/.test(normalized)
  )
    throw new Error("INVALID_AMOUNT");
  normalized = normalized.replaceAll("٬", "").replaceAll("٫", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new Error("INVALID_AMOUNT");
  const parts = normalized.split("."),
    fraction = parts[1] ?? "";
  if (fraction.length > decimals) throw new Error("INVALID_AMOUNT");
  const result = BigInt(parts[0]! + fraction.padEnd(decimals, "0")).toString();
  if (result.length > 20) throw new Error("INVALID_AMOUNT");
  return result;
}
export function formatInstrumentMinor(
  value: string | number,
  decimals: number,
) {
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 4 ||
    !/^\d{1,20}$/.test(String(value))
  )
    throw new Error("INVALID_AMOUNT");
  const digits = BigInt(value)
    .toString()
    .padStart(decimals + 1, "0");
  return decimals
    ? `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`
    : digits;
}
