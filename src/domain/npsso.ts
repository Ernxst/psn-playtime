/** Reduce a pasted npsso value to the bare token. */
export function normalizeNpsso(input: string): string {
  const trimmed = input.trim();
  const jsonMatch = trimmed.match(/"?npsso"?\s*:\s*"([^"]+)"/);
  if (jsonMatch?.[1]) {
    return jsonMatch[1].trim();
  }
  return trimmed.replace(/^[{}"\s]+|[{}"\s]+$/g, "").trim();
}
