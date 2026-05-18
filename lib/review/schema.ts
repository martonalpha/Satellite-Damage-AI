import { z } from "zod";

export const DamageVerdictSchema = z.enum([
  "SIGNIFICANT_DAMAGE",
  "MODERATE_DAMAGE",
  "MINOR_DAMAGE",
  "NO_CHANGE",
  "INSUFFICIENT_EVIDENCE",
]);

export const TargetStatusSchema = z.enum([
  "destroyed",
  "partially_active",
  "active",
  "unknown",
]);

export const ConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);

export const DamageTypeSchema = z.enum([
  "structural_destruction",
  "fire_damage",
  "flooding",
  "debris",
  "infrastructure_damage",
  "vegetation_loss",
  "crater",
  "other",
]);

export const SeveritySchema = z.enum(["HIGH", "MEDIUM", "LOW"]);

export const AlignmentQualitySchema = z.enum(["GOOD", "PARTIAL", "POOR"]);

export const DamageZoneSchema = z.object({
  zone_id: z.string(),
  description: z.string(),
  damage_type: DamageTypeSchema,
  severity: SeveritySchema,
  location_hint: z.string(),
  estimated_area: z.string().nullable(),
  notes: z.array(z.string()),
});

export const AffectedObjectSchema = z.object({
  name: z.string(),
  damage_percent: z.number().min(0).max(100),
  status: z.enum(["destroyed", "heavily_damaged", "partially_damaged", "intact", "unknown"]),
  notes: z.string().nullable(),
});

export const SatelliteAnalysisResultSchema = z.object({
  schema_version: z.literal("2.0"),
  analysis_timestamp: z.string(),
  event_type: z.string(),
  target_status: TargetStatusSchema,
  recommended_action: z.string(),
  damage_assessment: z.object({
    overall_verdict: DamageVerdictSchema,
    confidence: ConfidenceSchema,
    confidence_score: z.number().min(0).max(100),
    confidence_reason: z.string(),
    estimated_affected_area: z.string().nullable(),
    damage_severity_score: z.number().min(0).max(100),
  }),
  affected_objects: z.array(AffectedObjectSchema),
  damage_zones: z.array(DamageZoneSchema),
  change_indicators: z.object({
    structural_changes: z.array(z.string()),
    vegetation_changes: z.array(z.string()),
    water_changes: z.array(z.string()),
    other_changes: z.array(z.string()),
  }),
  image_quality: z.object({
    before_image: z.object({
      usable: z.boolean(),
      issues: z.array(z.string()),
    }),
    after_image: z.object({
      usable: z.boolean(),
      issues: z.array(z.string()),
    }),
    alignment_quality: AlignmentQualitySchema,
  }),
  user_visible: z.object({
    summary: z.string(),
    key_findings: z.array(z.string()),
    uncertainty_notes: z.array(z.string()),
  }),
});

export type SatelliteAnalysisResult = z.infer<typeof SatelliteAnalysisResultSchema>;
export type DamageZone = z.infer<typeof DamageZoneSchema>;
export type AffectedObject = z.infer<typeof AffectedObjectSchema>;
export type DamageVerdict = z.infer<typeof DamageVerdictSchema>;
export type TargetStatus = z.infer<typeof TargetStatusSchema>;

// kept for image-metadata.ts compatibility
export type ReviewInputFile = {
  file: File;
  role: "source" | "preview" | "other";
  clientId: string;
  pairedSourceClientId?: string;
  filePath?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ReviewedFile = {
  file_id: string | null;
  file_name: string;
  file_path: string | null;
  role: "preview" | "source" | "other";
  hash: {
    algorithm: string | null;
    value: string | null;
    provided: boolean;
  };
  timestamps: {
    created_at: string | null;
    updated_at: string | null;
    reviewed_at: string;
  };
  notes: string[];
};
