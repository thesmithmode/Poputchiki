import postgres from "postgres";
import { cleanupNonces } from "./cleanup-nonces";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL required");

const sql = postgres(DATABASE_URL);
const FIVE_MIN = 5 * 60 * 1000;

async function runCleanup() {
  await cleanupNonces(sql).catch((err: unknown) =>
    console.error(
      JSON.stringify({ msg: "nonce_cleanup_error", error: String(err) }),
    ),
  );
}

runCleanup();
setInterval(runCleanup, FIVE_MIN);
