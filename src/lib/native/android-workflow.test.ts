import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const workflow = readFileSync(resolve(root, ".github/workflows/android.yml"), "utf8");
const gradle = readFileSync(resolve(root, "android/app/build.gradle"), "utf8");

const SECRETS = [
  "ANDROID_KEYSTORE_BASE64",
  "ANDROID_KEYSTORE_PASSWORD",
  "ANDROID_KEY_ALIAS",
  "ANDROID_KEY_PASSWORD",
];

describe("android workflow", () => {
  it("is named Android with dispatch and push triggers", () => {
    expect(workflow).toMatch(/^name: Android$/m);
    expect(workflow).toMatch(/^\s+workflow_dispatch:/m);
    expect(workflow).toMatch(/^\s+push:/m);
    expect(workflow).toContain('- "android/**"');
    expect(workflow).toContain('- "native/**"');
    expect(workflow).toContain('- "capacitor.config.ts"');
    expect(workflow).toContain('- ".github/workflows/android.yml"');
  });

  it("has read-only permissions, concurrency and a timeout", () => {
    expect(workflow).toMatch(/permissions:\s*\n\s+contents: read/);
    expect(workflow).toContain("cancel-in-progress: true");
    expect(workflow).toMatch(/timeout-minutes: 30/);
  });

  it("uses JDK 21 via setup-java", () => {
    expect(workflow).toContain("actions/setup-java@v4");
    expect(workflow).toMatch(/java-version: "?21"?/);
  });

  it("syncs Capacitor before running Gradle", () => {
    const sync = workflow.indexOf("npx cap sync android");
    const gradlew = workflow.indexOf("./gradlew");
    expect(sync).toBeGreaterThan(-1);
    expect(gradlew).toBeGreaterThan(sync);
  });

  it("runs unit tests and the debug build", () => {
    expect(workflow).toMatch(/\.\/gradlew testDebugUnitTest assembleDebug/);
    expect(workflow).toContain("lifeathlete-debug-apk");
  });

  it("guards every release step on HAS_KEYSTORE", () => {
    const releaseSteps = workflow
      .split(/\n\s+- (?=name:)/)
      .filter((s) => /assembleRelease|release\.keystore|name: Upload release APK|apksigner/.test(s));
    expect(releaseSteps.length).toBeGreaterThanOrEqual(4);
    for (const step of releaseSteps) {
      expect(step).toMatch(/if: (always\(\) && )?env\.HAS_KEYSTORE == ['"]true['"]/);
    }
  });

  it("detects the keystore in an early step without echoing it", () => {
    const detect = workflow.indexOf("HAS_KEYSTORE=true");
    expect(detect).toBeGreaterThan(-1);
    expect(detect).toBeLessThan(workflow.indexOf("npm ci"));
    expect(workflow).toContain('[ -n "$ANDROID_KEYSTORE_BASE64" ]');
  });

  it("has no pull_request or pull_request_target trigger", () => {
    expect(workflow).not.toMatch(/pull_request/);
  });

  it("uses secrets only as step-level env mapping lines", () => {
    const lines = workflow.split("\n");
    let count = 0;
    lines.forEach((line, i) => {
      if (!line.includes("${{ secrets.")) return;
      count++;
      expect(line).toMatch(/^ {10}([A-Z0-9_]+): \$\{\{ secrets\.\1 \}\}$/);
      const indent = line.length - line.trimStart().length;
      let j = i - 1;
      while (j >= 0 && (lines[j].trim() === "" || lines[j].length - lines[j].trimStart().length >= indent)) j--;
      expect(lines[j]).toMatch(/^ {8}env:$/);
    });
    expect(count).toBeGreaterThan(0);
  });

  it("has no workflow-level or job-level env map", () => {
    expect(workflow).not.toMatch(/^env:/m);
    expect(workflow).not.toMatch(/^ {4}env:/m);
  });

  it("uses exactly the four expected secret names and never echoes them", () => {
    const used = new Set(
      [...workflow.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]),
    );
    expect([...used].sort()).toEqual([...SECRETS].sort());
    for (const line of workflow.split("\n")) {
      if (/\becho\b/.test(line)) {
        for (const s of SECRETS) expect(line).not.toContain(s);
      }
    }
    expect(workflow).not.toMatch(/set -x/);
  });
});

describe("android/app/build.gradle signing", () => {
  it("reads the four env vars via System.getenv", () => {
    for (const name of [
      "ANDROID_KEYSTORE_PATH",
      "ANDROID_KEYSTORE_PASSWORD",
      "ANDROID_KEY_ALIAS",
      "ANDROID_KEY_PASSWORD",
    ]) {
      expect(gradle).toContain(`System.getenv('${name}')`);
    }
    expect(gradle).toContain("signingConfigs");
  });

  it("contains no literal passwords or keystore paths", () => {
    expect(gradle).not.toMatch(/\.(jks|keystore|p12)/);
    expect(gradle).not.toMatch(/(storePassword|keyPassword|keyAlias|storeFile)\s*=?\s*['"]/);
  });
});
