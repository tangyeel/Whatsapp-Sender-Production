"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    supabase().auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace("/login"); return; }
      const res = await fetch("/api/auth/profile", {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const { profile } = await res.json();
      router.replace(profile?.role === "admin" ? "/admin" : "/dashboard");
    });
  }, []);
  return null;
}
