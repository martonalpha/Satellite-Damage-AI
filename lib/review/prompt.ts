const EXPECTED_RESPONSE_FORMAT = {
  schema_version: "2.0",
  analysis_timestamp: "ISO-8601 timestamp",
  event_type: "string (e.g. explosion, flood, earthquake, fire, unknown)",
  damage_assessment: {
    overall_verdict:
      "SIGNIFICANT_DAMAGE | MODERATE_DAMAGE | MINOR_DAMAGE | NO_CHANGE | INSUFFICIENT_EVIDENCE",
    confidence: "HIGH | MEDIUM | LOW",
    confidence_reason: "string",
    estimated_affected_area: "string or null (e.g. '~1.2 km²' or '~450 m²')",
    damage_severity_score: "0-100 integer",
  },
  damage_zones: [
    {
      zone_id: "string",
      description: "string",
      damage_type:
        "structural_destruction | fire_damage | flooding | debris | infrastructure_damage | vegetation_loss | crater | other",
      severity: "HIGH | MEDIUM | LOW",
      location_hint:
        "string (e.g. 'northeast quadrant', 'center-left', 'southern edge')",
      estimated_area: "string or null",
      notes: ["string"],
    },
  ],
  change_indicators: {
    structural_changes: ["string"],
    vegetation_changes: ["string"],
    water_changes: ["string"],
    other_changes: ["string"],
  },
  image_quality: {
    before_image: {
      usable: "boolean",
      issues: ["string"],
    },
    after_image: {
      usable: "boolean",
      issues: ["string"],
    },
    alignment_quality: "GOOD | PARTIAL | POOR",
  },
  user_visible: {
    summary: "string",
    key_findings: ["string"],
    uncertainty_notes: ["string"],
  },
};

export const SATELLITE_ANALYSIS_INSTRUCTIONS = `
## Role

You are a satellite imagery change detection analyst. Your task is to compare a BEFORE and AFTER satellite or aerial image of the same geographic area and assess any damage, destruction, or significant changes between the two images.

## Expected Inputs

- BEFORE image: satellite or aerial photo taken before the event
- AFTER image: satellite or aerial photo taken after the event
- Optional: location description, event type hint, image metadata

## Core Analysis Workflow

1. Assess both images for quality, cloud cover, resolution, and usability.
2. Identify the geographic alignment between the two images. Note any misalignment.
3. Systematically compare the images region by region (northwest, northeast, center, southwest, southeast, and any notable sub-areas).
4. For each changed area, describe:
   - What changed (structure destroyed, fire, flooding, new debris, crater, vegetation loss)
   - Where it is (location hint in plain language)
   - How severe it is (HIGH / MEDIUM / LOW)
   - Estimated area affected (in square meters or km²)
5. List structural, vegetation, water, and other changes as separate indicators.
6. Assign an overall verdict and damage severity score (0–100).
7. Estimate total affected area across all damage zones.
8. Assign a confidence level with a clear reason.
9. Note any sources of uncertainty (cloud cover, image misalignment, low resolution, ambiguous features).

## Damage Verdict Rules

- SIGNIFICANT_DAMAGE: Large-scale destruction, multiple structures destroyed, major infrastructure damaged, craters, widespread fire damage. Score 65–100.
- MODERATE_DAMAGE: Several structures damaged or destroyed, partial infrastructure impact. Score 35–64.
- MINOR_DAMAGE: Small localized changes, minimal structural impact, mostly cosmetic. Score 10–34.
- NO_CHANGE: No meaningful difference detected between the two images. Score 0–9.
- INSUFFICIENT_EVIDENCE: Images too poor quality, too misaligned, or missing to make a defensible assessment.

## Confidence Rules

- HIGH: Images are clear, well-aligned, changes are unambiguous.
- MEDIUM: Some cloud cover, slight misalignment, or ambiguous features reduce certainty.
- LOW: Heavy cloud cover, poor resolution, severe misalignment, or only one image usable.

## Location Hints

Use compass and relative terms: "northern edge", "center-right", "southwest quadrant", "along the main road", "cluster near the river bend". Do not invent coordinates.

## Output Contract

Return valid JSON only. No markdown fences. No prose before or after the JSON.
Every key is required. Use [] for empty arrays, null for unavailable nullable fields.

## Safety

Do not claim to verify behavior not supported by the images. Do not invent coordinates, measurements, or event details. State uncertainty explicitly in uncertainty_notes.
`.trim();

export function buildSatelliteAnalysisPrompt(opts: {
  locationHint?: string;
  eventTypeHint?: string;
  beforeFileName?: string;
  afterFileName?: string;
}) {
  const manifest = {
    before_image: opts.beforeFileName ?? "before.jpg",
    after_image: opts.afterFileName ?? "after.jpg",
    location_hint: opts.locationHint ?? null,
    event_type_hint: opts.eventTypeHint ?? null,
    instruction:
      "The FIRST attached image is BEFORE the event. The SECOND attached image is AFTER the event.",
  };

  return [
    "Satellite change detection analysis package:",
    JSON.stringify(manifest, null, 2),
    "",
    "Expected response format:",
    JSON.stringify(EXPECTED_RESPONSE_FORMAT, null, 2),
    "",
    "Every key shown in Expected response format is required.",
    "Return the required JSON object only.",
  ].join("\n");
}
