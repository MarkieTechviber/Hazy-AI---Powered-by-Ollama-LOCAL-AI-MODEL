const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { HazyDatabase } = require("../storage/hazyDatabase");
const { SecretVault } = require("../security/secretVault");

test("provider secrets are encrypted at rest and can be removed", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hazy-vault-"));
  const database = new HazyDatabase(path.join(directory, "hazy.db"));
  const vault = new SecretVault(database);
  const secret = "sk-test-secret-value";

  assert.equal(vault.set("openai", secret), true);
  assert.equal(vault.get("openai"), secret);
  assert.equal(vault.has("openai"), true);

  const row = database.db.prepare(
    "SELECT ciphertext FROM provider_secrets WHERE provider = ?"
  ).get("openai");
  assert.ok(row.ciphertext);
  assert.equal(row.ciphertext.includes(secret), false);

  assert.equal(vault.delete("openai"), true);
  assert.equal(vault.get("openai"), "");
});
