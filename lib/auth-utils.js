import { cookies } from "next/headers";

export function extractToken(cookieHeader) {
  if (!cookieHeader) return "";
  const match = cookieHeader.match(/sb-[^=]+-auth-token=([^;]+)/);
  if (!match) return "";
  try {
    const decoded = decodeURIComponent(match[1]);
    const parsed = JSON.parse(decoded);
    return Array.isArray(parsed) ? parsed[0] : parsed?.access_token ?? "";
  } catch { return ""; }
}

export async function getUser(request) {
  let token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    const cookieHeader = allCookies.map(c => `${c.name}=${c.value}`).join("; ");
    token = extractToken(cookieHeader);
  }
  if (!token) return null;

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}
