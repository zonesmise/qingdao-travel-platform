import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dataSource = readFileSync(new URL("../lib/data.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");

test("deleted products do not reserve their old style number", () => {
  assert.match(
    dataSource,
    /ON products \(style_number\) WHERE style_number != '' AND status != 'deleted'/,
  );
  assert.match(
    schemaSource,
    /styleNumber\} != '' AND \$\{table\.status\} != 'deleted'/,
  );
});
