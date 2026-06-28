/**
 * Contract tests: verify shared Zod schemas match committed JSON snapshots.
 * If a schema changes, update snapshots: bun run test:contract:update
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ComplaintInput,
  CreateReviewInput,
  CreateRideInput,
  LikeDTO,
  ReviewDTO,
  RideDTO,
  RideStatus,
  SupportMessageInput,
  UserDTO,
  UserProfileInput,
} from "@poputchiki/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = join(__dirname, "../../../..", "packages/shared/src/schemas/__snapshots__");

function loadSnapshot(name: string): unknown {
  const file = join(SNAPSHOT_DIR, `${name}.json`);
  return JSON.parse(readFileSync(file, "utf-8"));
}

function expectMeaningfulJsonSchema(name: string, schema: Record<string, unknown>): void {
  if (schema.type === "object") {
    expect(
      Object.keys((schema.properties as Record<string, unknown> | undefined) ?? {}),
      name,
    ).not.toHaveLength(0);
  }

  if (schema.type === "string" && Array.isArray(schema.enum)) {
    expect(schema.enum, name).not.toHaveLength(0);
  }

  const definitions = schema.definitions as Record<string, unknown> | undefined;
  expect(definitions?.[name], name).not.toEqual({});
}

// Cast needed: exactOptionalPropertyTypes in tsconfig conflicts with ZodTypeAny internals
// biome-ignore lint/suspicious/noExplicitAny: intentional for schema map
const SCHEMAS: Record<string, any> = {
  UserDTO,
  UserProfileInput,
  RideDTO,
  RideStatus,
  CreateRideInput,
  LikeDTO,
  ReviewDTO,
  CreateReviewInput,
  ComplaintInput,
  SupportMessageInput,
};

describe("schema snapshots", () => {
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    it(`${name} matches committed snapshot`, () => {
      const generated = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
      expectMeaningfulJsonSchema(name, generated);
      const snapshot = loadSnapshot(name);
      expect(generated).toEqual(snapshot);
    });
  }
});
