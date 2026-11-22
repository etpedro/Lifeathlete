"use client";

import { useEffect } from "react";
import { registerNativeHealthBridge } from "@/lib/health/capacitor";

/** Registers the Health Connect bridge when running inside the Android shell. Renders nothing. */
export function NativeHealthRegister() {
  useEffect(() => {
    void registerNativeHealthBridge();
  }, []);
  return null;
}
