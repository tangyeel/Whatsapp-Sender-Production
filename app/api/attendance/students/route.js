import { supabaseAdmin } from "@/lib/supabase";
import { getUser } from "@/lib/auth-utils";

export async function GET(request) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const batchId = searchParams.get("batch_id");
  if (!batchId) return Response.json({ error: "batch_id is required" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: batch } = await admin.from("batches").select("id").eq("id", batchId).eq("user_id", user.id).single();
  if (!batch) return Response.json({ error: "Batch not found" }, { status: 404 });

  const { data, error } = await admin.from("students").select("*").eq("batch_id", batchId).order("name", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ data });
}

export async function POST(request) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { batch_id, students } = await request.json();
  if (!batch_id || !Array.isArray(students)) return Response.json({ error: "Invalid data" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: batch } = await admin.from("batches").select("id").eq("id", batch_id).eq("user_id", user.id).single();
  if (!batch) return Response.json({ error: "Batch not found" }, { status: 404 });

  // Duplicate Prevention: Check for duplicate phones in the incoming list
  const phones = students.map(s => String(s.phone).replace(/\D/g, ""));
  if (new Set(phones).size !== phones.length) {
    return Response.json({ error: "Duplicate phone numbers found in the list." }, { status: 400 });
  }

  await admin.from("students").delete().eq("batch_id", batch_id);
  if (students.length === 0) return Response.json({ success: true });

  const { data, error } = await admin.from("students").insert(students.map(s => ({
    batch_id,
    name: s.name,
    phone: String(s.phone).replace(/\D/g, "")
  }))).select();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true, data });
}
