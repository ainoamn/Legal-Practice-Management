"use client";

import { BhdPrivacyGate } from "@/components/bhd/BhdPrivacyGate";
import { BhdSilentSso } from "@/components/bhd/BhdSilentSso";

export function BhdAccountIsolation() {
  return (
    <>
      <BhdSilentSso />
      <BhdPrivacyGate />
    </>
  );
}
