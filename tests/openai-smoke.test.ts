import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { getOpenAIClient, getReviewModel } from "../lib/openai";

const runSmokeTest = process.env.RUN_OPENAI_SMOKE_TEST === "1";

test(
  "OpenAI API key from .env.local can authenticate and access the review model",
  {
    skip: runSmokeTest
      ? false
      : "Set RUN_OPENAI_SMOKE_TEST=1 to run the live OpenAI API smoke test.",
  },
  async () => {
    loadEnvLocal();

    assert.match(
      process.env.OPENAI_API_KEY ?? "",
      /^sk-/,
      "OPENAI_API_KEY must be set in .env.local and look like an OpenAI secret key.",
    );

    const model = getReviewModel();
    const client = getOpenAIClient();
    const retrieved = await client.models.retrieve(model);

    assert.equal(
      retrieved.id,
      model,
      `Expected OpenAI to return model '${model}'.`,
    );
  },
);

function loadEnvLocal() {
  const envPath = join(process.cwd(), ".env.local");

  assert.equal(
    existsSync(envPath),
    true,
    ".env.local does not exist. Create it from .env.example first.",
  );

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = stripMatchingQuotes(trimmed.slice(separatorIndex + 1).trim());

    process.env[key] = value;
  }
}

function stripMatchingQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
