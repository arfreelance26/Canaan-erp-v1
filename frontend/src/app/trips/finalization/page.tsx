"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FinalizationRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/trips/verification"); }, [router]);
  return null;
}
