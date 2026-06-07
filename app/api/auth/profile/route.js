import { supabaseAdmin } from "@/lib/supabase";
import { getUser } from "@/lib/auth-utils";

export async function GET(request) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ profile });
}

export async function PATCH(request) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { whatsapp_token, phone_number_id, template_name, school_name } = await request.json();
  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("profiles")
    .update({ 
      whatsapp_token, 
      phone_number_id, 
      template_name, 
      school_name 
    })
    .eq("id", user.id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true, profile: data });
}
