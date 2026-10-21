import { uuidv7 } from "uuidv7";

/**
 * Time-ordered, index-friendly, non-guessable primary keys (data-model principle #2).
 * UUIDv7 sorts by creation time, which keeps B-tree inserts sequential on Postgres.
 */
export function newId(): string {
  return uuidv7();
}
