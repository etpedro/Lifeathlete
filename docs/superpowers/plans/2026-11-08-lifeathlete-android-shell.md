# Lifeathlete Android Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an installable Android app (Capacitor shell over the production site) that reads steps, workout minutes, sleep hours and mindful minutes from Health Connect and feeds the existing `HealthBridge` / `health-sync` pipeline.

**Architecture:** A Capacitor app in `android/` whose WebView opens `https://lifeathlete.vercel.app`; a small Kotlin plugin `HealthConnectBridge` (read-only) exposes availability, permissions and daily metrics; a web adapter (`src/lib/health/capacitor.ts`) registers a `HealthBridge` over that plugin at startup. GitHub Actions compiles, tests and signs the APK.

**Tech Stack:** Capacitor 8.6.0 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`), Kotlin, `androidx.health.connect:connect-client`, Gradle, GitHub Actions, Vitest, Next.js 16.

**Spec:** `docs/superpowers/specs/2026-11-08-lifeathlete-android-shell-design.md`

## Global Constraints

- `appId` is `app.lifeathlete.android` (permanent once installed); `appName` is `Lifeathlete`.
- The shell opens `https://lifeathlete.vercel.app/?source=pwa` (the proxy sends that launch to Hoje); `allowNavigation` is only `lifeathlete.vercel.app`; cleartext traffic off; external links open in the phone's browser.
- The plugin only reads. Manifest permissions are exactly `READ_STEPS`, `READ_EXERCISE`, `READ_SLEEP`, `READ_MINDFULNESS` (`android.permission.health.*`): no write, no background read.
- Metrics (keys `steps | workout_minutes | sleep_hours | mindful_minutes`) are per local calendar day of the phone, for the last 7 days (`SYNC_DAYS`), only for the requested categories. A metric with no data that day is **omitted**; never 0 for "no records". Sleep of a date = sleep sessions that **end** on that local date, in hours, without "awake" stages, 2 decimals; workout and mindful in whole minutes; steps whole.
- The `HealthBridge` contract in `src/lib/health/bridge.ts` keeps its three methods and their meaning (`isAvailable()` stays synchronous).
- The Android SDK is unavailable in the development environment: nothing under `android/` can be compiled or run here. Web code is verified with `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`; Android code by the GitHub Actions run.
- Commits end with the attribution lines the session requires; push only to branch `ccr-eb79cda8-tr265g`; no PRs; `main` is touched only when the user says so.
- The signing key never enters the repository.

## Review Focus

- The bridge registers **after** the Integrations screen has mounted (async availability check): the screen must still switch from "unavailable" to the connect UI (Task 1 test).
- Health Connect missing or too old (`available: false`): nothing is registered and the screen keeps the "only in the Android app" notice (Task 2 test).
- Mindfulness unavailable on the device: it is never requested and never read, the other three still work; if it was the only category asked, the existing `permission_denied` path results (Task 2 tests).
- The plugin returns junk (unknown keys, negative, NaN, 0 sent for no data): the adapter drops it before `sync.ts` sees it (Task 2 test).
- Sleep crossing midnight, DST days, several sessions in a day, awake time, sessions ending outside the window (Task 5 JUnit tests).
- A link to another host from inside the app must not navigate the shell (Task 4 config test).

---

### Task 1: Bridge change notifications

**Files:**
- Modify: `src/lib/health/bridge.ts`
- Modify: `src/components/profile/integrations/HealthIntegration.tsx` (the `subscribe` constant at line ~24 and `useHealthBridge`)
- Test: `src/lib/health/bridge.test.ts` (create)

**Interfaces:**
- Produces: `subscribeHealthBridge(listener: () => void): () => void` in `bridge.ts`; `registerHealthBridge` calls every current listener after changing the registered value (also when set to null).

- [ ] **Step 1: Write failing tests** in `bridge.test.ts`: (a) a listener is called once when `registerHealthBridge(b)` is called and `getHealthBridge()` then returns `b`; (b) after the returned unsubscribe is called, registering does not call it; (c) registering `null` also notifies; (d) a listener that throws does not stop the others. Reset with `registerHealthBridge(null)` in `afterEach`.
- [ ] **Step 2: Run** `npx vitest run src/lib/health/bridge.test.ts`. Expected: FAIL (`subscribeHealthBridge` missing).
- [ ] **Step 3: Implement** `subscribeHealthBridge` with a `Set` of listeners in `bridge.ts`; notify inside `registerHealthBridge`. In `HealthIntegration.tsx` replace the no-op `subscribe` with `subscribeHealthBridge`.
- [ ] **Step 4: Add a component-level test** (existing integration view tests live next to `HealthIntegration`; follow their style, or add `HealthIntegration.bridge.test.tsx`): render the screen with no bridge ("unavailable"), then `registerHealthBridge(fake)` inside `act`, and assert the connect button appears. This is the Review Focus line 1.
- [ ] **Step 5: Run** `npm test && npx tsc --noEmit && npm run lint`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(health): notify subscribers when the native bridge registers`.

### Task 2: Capacitor adapter and registration

**Files:**
- Modify: `package.json` (dependency `@capacitor/core@8.6.0`)
- Create: `src/lib/health/capacitor.ts`, `src/lib/health/capacitor.test.ts`
- Create: `src/components/health/NativeHealthRegister.tsx`
- Modify: `src/app/[locale]/layout.tsx` (render `<NativeHealthRegister />` beside `<ServiceWorkerRegister />`)
- Modify: `src/components/profile/integrations/HealthIntegration.tsx`, `HealthIntegrationView.tsx` (+ its test), `src/messages/pt.json`, `src/messages/en.json` (Step 6)

**Interfaces:**
- Consumes: `registerHealthBridge`, `HealthBridge` (`bridge.ts`); `AutoMetric`, `knownMetrics`, `metricValue`, `SYNC_DAYS` (`metrics.ts`).
- Produces (in `capacitor.ts`):
  - `type HealthConnectBridgePlugin = { isAvailable(): Promise<{ available: boolean; unavailableCategories: AutoMetric[] }>; checkPermissions(o: { categories: AutoMetric[] }): Promise<{ granted: AutoMetric[] }>; requestPermissions(o: { categories: AutoMetric[] }): Promise<{ granted: AutoMetric[] }>; readMetrics(o: { days: number; categories: AutoMetric[] }): Promise<{ days: { date: string; metrics: Partial<Record<AutoMetric, number>> }[] }> }` (this exact shape is the contract Task 5 implements in Kotlin; plugin name `"HealthConnectBridge"`).
  - `createCapacitorHealthBridge(plugin: HealthConnectBridgePlugin, unavailable: readonly AutoMetric[]): HealthBridge`
  - `registerNativeHealthBridge(deps?: { isNative?: () => boolean; plugin?: HealthConnectBridgePlugin }): Promise<boolean>` (true when a bridge was registered). Defaults: `Capacitor.isNativePlatform()` and `registerPlugin<HealthConnectBridgePlugin>("HealthConnectBridge")`.

- [ ] **Step 1: Install** `npm install @capacitor/core@8.6.0`.
- [ ] **Step 2: Write failing tests** in `capacitor.test.ts` with a fake plugin:
  - not native → returns false, nothing registered, plugin never called;
  - native, `available: false` → false, nothing registered (Review Focus 2);
  - native, available → true and `getHealthBridge()?.isAvailable()` is `true`;
  - `requestPermission(["steps","mindful_minutes"])` with `unavailableCategories: ["mindful_minutes"]` calls the plugin with only `["steps"]` and resolves to its granted list; with only `["mindful_minutes"]` asked it does **not** call the plugin and resolves `[]` (Review Focus 3);
  - `readMetrics(7, ["steps","sleep_hours"])` calls the plugin with exactly those categories and `days: 7` and returns its days; categories filtered as unavailable are not passed; when none are left it returns `[]` without calling the plugin;
  - junk dropped: input days with an unknown metric key, a negative value, `NaN`, a string, a day without `metrics`, and a duplicate date → only valid days/keys remain, values rounded by `metricValue`; a metric the caller did not ask for is dropped (Review Focus 4);
  - plugin rejection in `readMetrics`/`requestPermission` propagates (the callers in `sync.ts` already map it to `read_failed` / `permission_denied`).
- [ ] **Step 3: Run** `npx vitest run src/lib/health/capacitor.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** `capacitor.ts` per the Interfaces block. `registerNativeHealthBridge` swallows a rejected `isAvailable()` (returns false, registers nothing).
- [ ] **Step 5: Implement** `NativeHealthRegister` (`"use client"`, `useEffect` calling `void registerNativeHealthBridge()` once, renders `null`) and mount it in the locale layout. Add a test that it calls the function once on mount (mock the module).
- [ ] **Step 6: Health Connect missing or outdated message.** Export `isNativeShell(): boolean` from `capacitor.ts` (`Capacitor.isNativePlatform()`). In `HealthIntegration.tsx` pass `nativeShell={isNativeShell()}` (read on the client) to the view; when the device state is "none" and `nativeShell` is true, `HealthIntegrationView` shows the new key `profile.integrations.needsHealthConnect` instead of `unavailable`. Add the key in PT ("Instala ou atualiza o Health Connect na Play Store e volta a abrir a app.") and EN ("Install or update Health Connect from the Play Store, then reopen the app."). Failing test first: view with `device: "none"` and `nativeShell: true` shows the new text, with `nativeShell: false` still shows the old one.
- [ ] **Step 7: Run** `npm test && npx tsc --noEmit && npm run lint && npm run build`. Expected: all pass.
- [ ] **Step 8: Commit** `feat(health): Capacitor adapter registering the native HealthBridge`.

### Task 3: Public health-privacy page

The Health Connect rationale activity (Task 5) opens this page; the full privacy policy remains the owner's responsibility.

**Files:**
- Modify: `src/lib/auth/access.ts` (`PUBLIC_PREFIXES` gains `"/privacy"`), `src/lib/auth/access.test.ts`
- Create: `src/app/[locale]/privacy/health/page.tsx`
- Modify: `src/messages/pt.json`, `src/messages/en.json` (namespace `privacyHealth`: `title`, `intro`, `reads`, `stores`, `kept`, `unverified`, `control`)

**Interfaces:**
- Produces: public route `/{locale}/privacy/health` (static text, signed-out reachable).

- [ ] **Step 1: Failing test** in `access.test.ts`: `proxyRedirect("/pt/privacy/health", false)` and the `en` equivalent return `null`; `proxyRedirect("/pt/today", false)` still returns `/pt/login`.
- [ ] **Step 2: Run** `npx vitest run src/lib/auth/access.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the prefix and the page (server component using `getTranslations`, `setRequestLocale`; layout like the login page). Texts reuse the wording of `profile.integrations.consent.*` (what is read, what is sent and stored, how long, unverified, how to disconnect), in PT and EN, ending with a link back to the site. The existing messages parity test must keep passing.
- [ ] **Step 4: Run** `npm test && npx tsc --noEmit && npm run lint && npm run build`. Expected: pass; the build lists `/[locale]/privacy/health`.
- [ ] **Step 5: Commit** `feat: public health privacy page for the Health Connect rationale`.

### Task 4: Capacitor project scaffold

**Files:**
- Modify: `package.json` (devDependencies `@capacitor/cli@8.6.0`, `@capacitor/android@8.6.0`; scripts `"android:sync": "cap sync android"`), `eslint.config.mjs` (add `"android/**"`, `"native/**"` to `ignores`), `.gitignore` (nothing extra if `android/.gitignore` is generated; verify)
- Create: `capacitor.config.ts`, `src/lib/native/capacitor-config.test.ts`, `native/www/index.html`, `native/www/offline.html`
- Generate: `android/` via `npx cap add android` (committed)

**Interfaces:**
- Produces: `capacitor.config.ts` default export `CapacitorConfig` with `appId: "app.lifeathlete.android"`, `appName: "Lifeathlete"`, `webDir: "native/www"`, `server: { url: "https://lifeathlete.vercel.app/?source=pwa", allowNavigation: ["lifeathlete.vercel.app"], cleartext: false, errorPath: "offline.html" }`.

- [ ] **Step 1: Failing test** `capacitor-config.test.ts`: import the config and assert the values above; `allowNavigation` contains no wildcard and no other host; `server.url` starts with `https://`; the offline page and index exist under `webDir` and `offline.html` contains a retry control (`<button` or `<a`) and PT and EN text.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Install and write** `npm install -D @capacitor/cli@8.6.0 @capacitor/android@8.6.0`; write `capacitor.config.ts`; write `native/www/index.html` (minimal redirect/placeholder, only used if the remote URL cannot load) and `native/www/offline.html` (self-contained, dark calm styling consistent with `public/offline/pt.html`, PT and EN, "Tentar novamente / Try again" reloading the app URL).
- [ ] **Step 4: Scaffold** `npx cap add android` then `npx cap sync android`. Raise `minSdkVersion` to 26 in `android/variables.gradle` (the Health Connect client requires it). Confirm `android/.gitignore` excludes build outputs and `local.properties`.
- [ ] **Step 5: Run** `npm test && npx tsc --noEmit && npm run lint && npm run build`. Expected: pass (tsc sees `capacitor.config.ts`).
- [ ] **Step 6: Commit** `feat(android): Capacitor project scaffold (appId app.lifeathlete.android)`.

### Task 5: Kotlin plugin, manifest and rationale activity

Not compilable here; reviewed by reading, compiled and unit-tested by CI (Task 6).

**Files:**
- Modify: `android/app/build.gradle` (Kotlin plugin, `androidx.health.connect:connect-client` dependency, `kotlinx-coroutines-android`, `testImplementation` JUnit already present), `android/build.gradle` (Kotlin Gradle plugin on the classpath, version matching the Gradle/AGP the template generated), `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/java/app/lifeathlete/android/MainActivity.java` (register the plugin before `super.onCreate`)
- Create: `android/app/src/main/java/app/lifeathlete/android/DailyMath.kt`, `.../HealthConnectBridgePlugin.kt`, `.../HealthRationaleActivity.kt`
- Test: `android/app/src/test/java/app/lifeathlete/android/DailyMathTest.kt`

**Interfaces:**
- Produces: Capacitor plugin named `HealthConnectBridge` with methods `isAvailable`, `checkPermissions`, `requestPermissions`, `readMetrics` and the JSON shapes of `HealthConnectBridgePlugin` in Task 2 (category strings are the four metric keys).
- Pure functions in `DailyMath.kt` (`object DailyMath`):
  - `data class SleepSessionData(val start: Instant, val end: Instant, val awakeSeconds: Long)`
  - `fun sleepHoursByEndDate(sessions: List<SleepSessionData>, zone: ZoneId): Map<LocalDate, Double>` (hours of `end-start-awake`, summed per local date of `end`, rounded to 2 decimals; sessions with non-positive length or awake time ≥ length are ignored)
  - `fun roundMinutes(seconds: Long): Int` (nearest whole minute)
  - `fun windowDates(today: LocalDate, days: Int): List<LocalDate>` (newest first, `days` entries, today included)
  - `fun dropEmpty(values: Map<LocalDate, Map<String, Double>>): List<Pair<LocalDate, Map<String, Double>>>` (omits days with no metrics, never a zero placeholder)

- [ ] **Step 1: Write failing JUnit tests** in `DailyMathTest.kt` for the Review Focus sleep cases: a session 23:30→06:45 local attributes 6.25 h to the end date; awake 30 min is subtracted; two sessions ending the same day are summed; a session ending after the window is not passed in by the caller but one ending exactly at 00:00 belongs to the new date; a DST day (Europe/Lisbon, last Sunday of March and October) uses the zone's real clock for the date; zero/negative sessions are ignored; `roundMinutes(89)` is 1 and `roundMinutes(90)` is 2; `windowDates` order and size; `dropEmpty` keeps no empty day and never inserts 0.
- [ ] **Step 2: Implement** `DailyMath.kt` to satisfy them (pure Kotlin, no Android imports).
- [ ] **Step 3: Implement the plugin** (`@CapacitorPlugin(name = "HealthConnectBridge")`, coroutines on `Dispatchers.IO` resolved on the plugin call):
  - `isAvailable`: `HealthConnectClient.getSdkStatus(context)`; `available` is true only for `SDK_AVAILABLE`; `unavailableCategories` contains `mindful_minutes` when the mindfulness feature is not supported by the client (`getFeatureStatus(FEATURE_MINDFULNESS_SESSION)`; if the constant is missing in the pinned library version use `FEATURE_...` per its release notes).
  - `checkPermissions` / `requestPermissions`: map category → read permission (`HealthPermission.getReadPermission(StepsRecord::class)`, `ExerciseSessionRecord`, `SleepSessionRecord`, `MindfulnessSessionRecord`); `requestPermissions` builds the intent with `PermissionController.createRequestPermissionResultContract().createIntent(context, permissions)`, starts it with Capacitor's `startActivityForResult(call, intent, "permissionResult")` and resolves with the granted subset (an `@ActivityCallback` using the contract's `parseResult`).
  - `readMetrics`: for each local date in `windowDates(LocalDate.now(zone), days)` where `zone = ZoneId.systemDefault()`, query only categories that are granted: steps via `aggregate(StepsRecord.COUNT_TOTAL)`, workout via `ExerciseSessionRecord.EXERCISE_DURATION_TOTAL`, mindful via the mindfulness duration aggregate, over `[date.atStartOfDay(zone), next day)`; sleep via `readRecords(SleepSessionRecord)` over the window padded by one day, mapped to `SleepSessionData` (awake stages summed from `SleepSessionRecord.STAGE_TYPE_AWAKE` and `AWAKE_IN_BED`) and fed to `sleepHoursByEndDate`. Omit a metric when the aggregate is absent or zero-length; apply `dropEmpty`; return `{ days: [{ date: "YYYY-MM-DD", metrics: { ... } }] }`.
  - Reject with a clear error code string when Health Connect is unavailable.
- [ ] **Step 4: Rationale activity and manifest.** `HealthRationaleActivity` opens `https://lifeathlete.vercel.app/<locale>/privacy/health` (locale from the device language, `pt` or `en`, default `pt`) with `ACTION_VIEW` in the browser and finishes. Manifest: the four `android.permission.health.READ_*` permissions; `<queries><package android:name="com.google.android.apps.healthdata"/></queries>`; the activity with an intent filter for `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE`; an `activity-alias` for `android.intent.action.VIEW_PERMISSION_USAGE` with category `android.intent.category.HEALTH_PERMISSIONS`. No other permission is added beyond what the Capacitor template declares.
- [ ] **Step 5: Register** the plugin in `MainActivity.java` with `registerPlugin(HealthConnectBridgePlugin.class)` before `super.onCreate(savedInstanceState)`.
- [ ] **Step 6: Re-read** every file in this task against the Global Constraints (permissions exactly four reads, no write APIs, omit-not-zero, end-date sleep) and run `npm test` to confirm the web side is untouched.
- [ ] **Step 7: Commit** `feat(android): Health Connect plugin, rationale activity and manifest`.

### Task 6: Build workflow, signing and key delivery

**Files:**
- Create: `.github/workflows/android.yml`
- Modify: `android/app/build.gradle` (release `signingConfig` that reads `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` from the environment and is skipped when they are absent)

**Interfaces:**
- Produces: workflow `Android` (`workflow_dispatch` plus `push` with paths `android/**`, `native/**`, `capacitor.config.ts`, `.github/workflows/android.yml`), artifacts `lifeathlete-debug-apk` (always) and `lifeathlete.apk` (only when the four secrets exist).

- [ ] **Step 1: Write the workflow:** checkout; `actions/setup-node@v4` (Node 22, npm cache); `actions/setup-java@v4` (Temurin 17); `npm ci`; `npx cap sync android`; `cd android && ./gradlew testDebugUnitTest assembleDebug`; upload the debug APK; a release step guarded by `if: env.ANDROID_KEYSTORE_BASE64 != ''` that decodes the keystore to `$RUNNER_TEMP`, runs `./gradlew assembleRelease` and uploads `lifeathlete.apk` (retention 30 days). Secrets are read only from `secrets.*`, never echoed.
- [ ] **Step 2: Add the release signing config** to `android/app/build.gradle` as described; with no environment it must still allow `assembleDebug`.
- [ ] **Step 3: Validate the YAML** locally (`python3 -c "import yaml,sys;yaml.safe_load(open('.github/workflows/android.yml'))"`; expected: no error) and read the file against the spec's section 4.
- [ ] **Step 4: Commit** `ci(android): build, test and sign the APK in GitHub Actions`.
- [ ] **Step 5: Push the branch and read the first run** with the GitHub Actions tools (`actions_list`, `get_job_logs`). Expected: first run may fail to compile. Fix what the log shows (versions, imports, Gradle plugin) in small commits until `testDebugUnitTest` and `assembleDebug` pass.
- [ ] **Step 6: Generate the signing key** (only after the debug build is green) in a temporary directory outside the repository: `keytool -genkeypair` (RSA 2048, validity 10000 days, alias `lifeathlete`, random passwords from `/dev/urandom`); write the base64 of the keystore to a file in the scratchpad; send the keystore base64 file with `SendUserFile`; give the user the alias and, **in a separate message**, the two passwords, with the four secret names and the GitHub path (repository Settings → Secrets and variables → Actions → New repository secret); then delete the keystore, base64 file and password files and confirm they are gone.
- [ ] **Step 7: After the user confirms the secrets exist,** trigger the workflow (`actions_run_trigger`), confirm the `lifeathlete.apk` artifact exists, and tell the user where to download it.

### Task 7: README and phone checklist

**Files:**
- Modify: `README.md` (new section "App Android")

- [ ] **Step 1: Write the section:** what the shell is (opens the production site, Health Connect plugin), how to build (the workflow), the four secrets and how the key was produced, how to download and install the APK on a Samsung (allow installs from the browser/Files app), how updates work (same key, install over), the Huawei Watch GT 2 chain (Huawei Health → Health Sync → Health Connect, third-party, to be confirmed on the phone), and this checklist: install; open and sign in; Perfil → Integrações shows "Ligar dados do telemóvel"; connect, grant permissions for the categories you want; "Sincronizar agora" shows days synced; Hoje shows habits with `auto_source` filled "via Health Connect"; manual log on a filled day is kept; disconnect stops syncing; external links open in the browser; airplane mode on first open shows the offline page.
- [ ] **Step 2: Run** `npm test && npm run lint` (README is unchecked by tests; confirm nothing else changed). Commit `docs: Android app build, install and phone checklist`.

### Task 8: Independent review and handoff

- [ ] **Step 1:** Build a review package of the diff from `f0b8c87` (the spec commit) to HEAD (`git diff f0b8c87..HEAD`), excluding `android/gradle/wrapper` and generated Capacitor files.
- [ ] **Step 2:** Run the independent reviewer (most capable model) over the whole diff with the Global Constraints and Review Focus; apply Critical and Important findings in a fix round; re-run all web gates and the Android workflow until green.
- [ ] **Step 3:** Push; report to the user the artifact location, the checklist and the known limits (mindfulness alpha, Huawei data depends on Health Sync, Kotlin verified only by CI and the phone). Do **not** merge to `main` or deploy anything without the user's go-ahead (the web changes of Tasks 1–3 reach production only with that merge; the shell works against production only after it).
