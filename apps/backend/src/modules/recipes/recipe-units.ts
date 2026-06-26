export type RecipeUnit = "g" | "kg" | "ml" | "l" | "piece" | "portion" | "pack";
export type RecipeRoundingPolicy = "exact" | "practical";

export type Rational = Readonly<{
  numerator: bigint;
  denominator: bigint;
}>;

type UnitDimension = "mass" | "volume" | "piece" | "portion" | "pack";

type UnitDefinition = {
  dimension: UnitDimension;
  baseFactor: Rational;
  practicalIncrement: Rational;
};

const ZERO: Rational = { numerator: 0n, denominator: 1n };
const ONE: Rational = { numerator: 1n, denominator: 1n };

function absolute(value: bigint) {
  return value < 0n ? -value : value;
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = absolute(left);
  let b = absolute(right);
  while (b !== 0n) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1n;
}

export function rational(numerator: bigint, denominator = 1n): Rational {
  if (denominator === 0n) throw new Error("RATIONAL_DIVISION_BY_ZERO");
  const sign = denominator < 0n ? -1n : 1n;
  const normalizedNumerator = numerator * sign;
  const normalizedDenominator = denominator * sign;
  const divisor = greatestCommonDivisor(normalizedNumerator, normalizedDenominator);
  return {
    numerator: normalizedNumerator / divisor,
    denominator: normalizedDenominator / divisor,
  };
}

export function parseDecimal(value: string | number): Rational {
  const source = String(value).trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(source);
  if (!match) throw new Error("INVALID_DECIMAL");

  const sign = match[1] === "-" ? -1n : 1n;
  const integerDigits = match[2];
  const fractionDigits = match[3] || "";
  const exponent = Number(match[4] || 0);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 100) throw new Error("INVALID_DECIMAL");

  const digits = BigInt(`${integerDigits}${fractionDigits}` || "0");
  const decimalPlaces = fractionDigits.length - exponent;
  if (decimalPlaces <= 0) {
    return rational(sign * digits * (10n ** BigInt(-decimalPlaces)));
  }
  return rational(sign * digits, 10n ** BigInt(decimalPlaces));
}

export function add(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

export function subtract(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

export function multiply(left: Rational, right: Rational): Rational {
  return rational(left.numerator * right.numerator, left.denominator * right.denominator);
}

export function divide(left: Rational, right: Rational): Rational {
  if (right.numerator === 0n) throw new Error("RATIONAL_DIVISION_BY_ZERO");
  return rational(left.numerator * right.denominator, left.denominator * right.numerator);
}

export function compare(left: Rational, right: Rational): number {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export function ceilRational(value: Rational): bigint {
  const quotient = value.numerator / value.denominator;
  const remainder = value.numerator % value.denominator;
  if (remainder === 0n) return quotient;
  return value.numerator > 0n ? quotient + 1n : quotient;
}

export function roundUpToIncrement(value: Rational, increment: Rational): Rational {
  if (compare(increment, ZERO) <= 0) throw new Error("INVALID_ROUNDING_INCREMENT");
  return multiply(rational(ceilRational(divide(value, increment))), increment);
}

export function decimalString(value: Rational, maximumFractionDigits = 6): string {
  if (!Number.isInteger(maximumFractionDigits) || maximumFractionDigits < 0 || maximumFractionDigits > 12) {
    throw new Error("INVALID_DECIMAL_PRECISION");
  }

  const negative = value.numerator < 0n;
  const numerator = absolute(value.numerator);
  const scale = 10n ** BigInt(maximumFractionDigits);
  const scaledNumerator = numerator * scale;
  let quotient = scaledNumerator / value.denominator;
  const remainder = scaledNumerator % value.denominator;
  if (remainder * 2n >= value.denominator) quotient += 1n;

  if (maximumFractionDigits === 0) return `${negative ? "-" : ""}${quotient}`;

  const digits = quotient.toString().padStart(maximumFractionDigits + 1, "0");
  const integerPart = digits.slice(0, -maximumFractionDigits);
  const fractionPart = digits.slice(-maximumFractionDigits).replace(/0+$/, "");
  return `${negative ? "-" : ""}${integerPart}${fractionPart ? `.${fractionPart}` : ""}`;
}

const UNIT_DEFINITIONS: Record<RecipeUnit, UnitDefinition> = {
  g: { dimension: "mass", baseFactor: ONE, practicalIncrement: ONE },
  kg: { dimension: "mass", baseFactor: rational(1000n), practicalIncrement: parseDecimal("0.001") },
  ml: { dimension: "volume", baseFactor: ONE, practicalIncrement: ONE },
  l: { dimension: "volume", baseFactor: rational(1000n), practicalIncrement: parseDecimal("0.001") },
  piece: { dimension: "piece", baseFactor: ONE, practicalIncrement: ONE },
  portion: { dimension: "portion", baseFactor: ONE, practicalIncrement: ONE },
  pack: { dimension: "pack", baseFactor: ONE, practicalIncrement: ONE },
};

export function isRecipeUnit(value: unknown): value is RecipeUnit {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(UNIT_DEFINITIONS, value);
}

export function areUnitsCompatible(left: RecipeUnit, right: RecipeUnit): boolean {
  return UNIT_DEFINITIONS[left].dimension === UNIT_DEFINITIONS[right].dimension;
}

export function convertRecipeQuantity(
  quantity: Rational,
  sourceUnit: RecipeUnit,
  targetUnit: RecipeUnit,
): Rational | null {
  if (!areUnitsCompatible(sourceUnit, targetUnit)) return null;
  const sourceBase = multiply(quantity, UNIT_DEFINITIONS[sourceUnit].baseFactor);
  return divide(sourceBase, UNIT_DEFINITIONS[targetUnit].baseFactor);
}

export function applyRecipeRounding(
  quantity: Rational,
  unit: RecipeUnit,
  policy: RecipeRoundingPolicy,
): Rational {
  if (policy === "exact") return quantity;
  return roundUpToIncrement(quantity, UNIT_DEFINITIONS[unit].practicalIncrement);
}

export function percentFactor(wastePercent: Rational, usableYieldPercent: Rational): Rational {
  if (compare(usableYieldPercent, ZERO) <= 0) throw new Error("INVALID_USABLE_YIELD");
  return divide(add(parseDecimal("100"), wastePercent), usableYieldPercent);
}

export function zeroRational(): Rational {
  return ZERO;
}
