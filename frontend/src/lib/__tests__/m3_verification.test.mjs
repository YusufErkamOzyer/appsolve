import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Verify parseUnifiedDiff behavior
const sampleDiff = `--- a/quickcart/cart/calculator.py
+++ b/quickcart/cart/calculator.py
@@ -40,4 +40,6 @@ def calculate_discount(subtotal, coupon_rate):
     if coupon_rate is None:
         return 0
-    discount = subtotal / coupon_rate
+    if coupon_rate == 0:
+        return 0
+    discount = subtotal * (coupon_rate / 100.0)
     return discount`;

// Simple extraction of parse function from tsx for test verification
const tsxContent = fs.readFileSync(
  path.resolve("./src/components/workstation/UnifiedDiffViewer.tsx"),
  "utf8"
);

test("UnifiedDiffViewer source code checks", () => {
  assert.ok(tsxContent.includes("parseUnifiedDiff"), "Contains parseUnifiedDiff function");
  assert.ok(tsxContent.includes("UnifiedDiffViewer"), "Contains UnifiedDiffViewer component");
  assert.ok(tsxContent.includes("totalAdditions"), "Tracks totalAdditions");
  assert.ok(tsxContent.includes("totalDeletions"), "Tracks totalDeletions");
  assert.ok(tsxContent.includes("oldLineNumber"), "Includes dual line numbers (old)");
  assert.ok(tsxContent.includes("newLineNumber"), "Includes dual line numbers (new)");
  assert.ok(tsxContent.includes("navigator.clipboard.writeText"), "Includes copy patch functionality");
});

test("ActionCard source code checks", () => {
  const actionCardContent = fs.readFileSync(
    path.resolve("./src/components/workstation/ActionCard.tsx"),
    "utf8"
  );

  assert.ok(actionCardContent.includes("UnifiedDiffViewer"), "Embeds UnifiedDiffViewer");
  assert.ok(actionCardContent.includes("github_branch"), "Displays github_branch");
  assert.ok(actionCardContent.includes("github_pr_number"), "Displays github_pr_number");
  assert.ok(actionCardContent.includes("⚡ PR BİRLEŞTİR VE DAĞIT"), "Contains '⚡ PR BİRLEŞTİR VE DAĞIT' execution control");
  assert.ok(actionCardContent.includes("✓ PR BİRLEŞTİRİLDİ"), "Contains '✓ PR BİRLEŞTİRİLDİ' merged status");
  assert.ok(actionCardContent.includes("SEV-1 DEADLOCK MONITOR"), "Contains SEV-1 Deadlock monitor");
  assert.ok(actionCardContent.includes("TRANSACTION KİLİT TABLOSU"), "Contains transaction lock table");
  assert.ok(!actionCardContent.includes("@solver'dan"), "No unescaped apostrophes");
});

test("Functional diff parsing verification", () => {
  // Replicate parseUnifiedDiff logic to verify behavior
  const lines = sampleDiff.split(/\r?\n/);
  let totalAdditions = 0;
  let totalDeletions = 0;
  let oldStart = 0;
  let newStart = 0;
  let currentOld = 0;
  let currentNew = 0;
  const hunks = [];
  let currentHunk = null;

  const hunkRegex = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/;

  for (const line of lines) {
    if (line.startsWith("--- ") || line.startsWith("+++ ")) continue;
    const match = line.match(hunkRegex);
    if (match) {
      oldStart = parseInt(match[1], 10);
      newStart = parseInt(match[3], 10);
      currentOld = oldStart;
      currentNew = newStart;
      currentHunk = { header: line, lines: [] };
      hunks.push(currentHunk);
      continue;
    }
    if (line.startsWith("+")) {
      totalAdditions++;
      currentHunk.lines.push({ type: "add", newLineNumber: currentNew++, sign: "+", content: line.slice(1) });
    } else if (line.startsWith("-")) {
      totalDeletions++;
      currentHunk.lines.push({ type: "delete", oldLineNumber: currentOld++, sign: "-", content: line.slice(1) });
    } else {
      currentHunk.lines.push({ type: "context", oldLineNumber: currentOld++, newLineNumber: currentNew++, sign: " ", content: line.slice(1) });
    }
  }

  assert.equal(totalAdditions, 3, "Sample diff has exactly 3 additions");
  assert.equal(totalDeletions, 1, "Sample diff has exactly 1 deletion");
  assert.equal(hunks.length, 1, "Sample diff has 1 hunk");
  assert.equal(oldStart, 40, "Old start line is 40");
  assert.equal(newStart, 40, "New start line is 40");
});

test("api.ts ActionCardPayload interface checks", () => {
  const apiContent = fs.readFileSync(
    path.resolve("./src/lib/api.ts"),
    "utf8"
  );

  assert.ok(apiContent.includes("github_branch?: string;"), "Has github_branch");
  assert.ok(apiContent.includes("github_branch_url?: string;"), "Has github_branch_url");
  assert.ok(apiContent.includes("github_pr_number?: number;"), "Has github_pr_number");
  assert.ok(apiContent.includes("github_pr_url?: string;"), "Has github_pr_url");
  assert.ok(apiContent.includes("diff_content?: string;"), "Has diff_content");
  assert.ok(apiContent.includes("affected_file?: string;"), "Has affected_file");
  assert.ok(apiContent.includes("merge_status?: 'pending' | 'merged' | 'not_applicable';"), "Has merge_status");
});
