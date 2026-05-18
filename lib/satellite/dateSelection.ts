import type { NormalizedFeatureProperties } from "@/lib/satellite/types";

const DEFAULT_BEFORE_DATE = "2021-06-21";
const DEFAULT_AFTER_DATE = "2022-03-14";

export function selectBeforeAfterDates({
  afterDate,
  beforeDate,
  feature,
}: {
  beforeDate?: string;
  afterDate?: string;
  feature: NormalizedFeatureProperties;
}) {
  const selectedAfterDate =
    normalizeDate(afterDate) ??
    normalizeDate(feature.imageryDate) ??
    DEFAULT_AFTER_DATE;
  const selectedBeforeDate =
    normalizeDate(beforeDate) ?? addDays(selectedAfterDate, -365);

  return {
    beforeDate: selectedBeforeDate,
    afterDate: selectedAfterDate,
  };
}

export function createDateWindow(date: string, windowDays: number) {
  const halfWindow = Math.max(0, Math.floor(windowDays));

  return {
    from: `${addDays(date, -halfWindow)}T00:00:00Z`,
    to: `${addDays(date, halfWindow)}T23:59:59Z`,
  };
}

function normalizeDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(/\d{4}-\d{2}-\d{2}/);

  if (!match) {
    return null;
  }

  return match[0];
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}
