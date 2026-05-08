import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
} from "../packages/shared/src/index.js";
import { zodToJsonSchema } from "zod-to-json-schema";

const SCHEMAS = {
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
} as const;

const OUT_DIR = join(import.meta.dir, "../packages/shared/src/schemas/__snapshots__");
mkdirSync(OUT_DIR, { recursive: true });

for (const [name, schema] of Object.entries(SCHEMAS)) {
  const json = zodToJsonSchema(schema, { name, $refStrategy: "none" });
  writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(json, null, 2) + "\n");
  console.log(`✓ ${name}`);
}

console.log("Done.");
