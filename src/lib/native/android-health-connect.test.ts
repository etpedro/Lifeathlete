import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const appGradle = readFileSync(resolve(root, "android/app/build.gradle"), "utf8");
const rootGradle = readFileSync(resolve(root, "android/build.gradle"), "utf8");
const variables = readFileSync(resolve(root, "android/variables.gradle"), "utf8");

/**
 * The toolchain is fixed by the Capacitor 8.6 template (AGP 8.13.0, compileSdk 36).
 * connect-client 1.2.0-alpha04+ is built with compileSdk 37 and its AAR metadata requires
 * compileSdk 37 and AGP 9.1.0 (CI checkAarMetadata failure with 1.2.0-alpha06); alpha02/alpha03
 * declare compileSdkExtension 19. Only versions proven to fit the template are allowed.
 */
const ALLOWED_CONNECT_CLIENT = ["1.2.0-alpha01"];

describe("android Health Connect dependency", () => {
  it("pins connect-client to a version compatible with AGP 8.13 / compileSdk 36", () => {
    const versions = [...appGradle.matchAll(/androidx\.health\.connect:connect-client:([^"']+)["']/g)].map(
      (m) => m[1],
    );
    expect(versions).toHaveLength(1);
    expect(ALLOWED_CONNECT_CLIENT).toContain(versions[0]);
  });

  it("keeps the template toolchain the dependency was chosen for", () => {
    expect(rootGradle).toContain("classpath 'com.android.tools.build:gradle:8.13.0'");
    expect(variables).toMatch(/compileSdkVersion = 36\b/);
  });
});
