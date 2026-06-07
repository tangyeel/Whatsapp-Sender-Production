import { supabaseAdmin } from "@/lib/supabase";
import { getUser } from "@/lib/auth-utils";

async function isAdmin(request) {
  const user = await getUser(request);
  if (!user) return false;
  const admin = supabaseAdmin();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin";
}

export async function GET(request) {
  if (!await isAdmin(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("profiles").select("*").order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ data });
}

export async function POST(request) {
  if (!await isAdmin(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { email, password, school_name, whatsapp_token, phone_number_id, template_name } = await request.json();
  const admin = supabaseAdmin();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createError) return Response.json({ error: createError.message }, { status: 400 });

  const { error: profileError } = await admin.from("profiles").upsert({
    id: created.user.id,
    email,
    role: "school",
    school_name: school_name || null,
    whatsapp_token: whatsapp_token || null,
    phone_number_id: phone_number_id || null,
    template_name: template_name || "marks_update",
    is_active: true,
  });

  if (profileError) return Response.json({ error: profileError.message }, { status: 500 });
  return Response.json({ success: true });
}

export async function PATCH(request) {
  if (!await isAdmin(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id, ...updates } = await request.json();
  const admin = supabaseAdmin();
  const { error } = await admin.from("profiles").update(updates).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
