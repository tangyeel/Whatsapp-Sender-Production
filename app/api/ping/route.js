import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request) {
  try {
    // Failsafe: Optionally require a secret token to prevent abuse of the ping route
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = supabaseAdmin();
    
    // A lightweight query to keep the Supabase database awake.
    // Fetching 1 row from a table registers as database activity.
    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .limit(1);

    if (error) {
      console.error("[Ping] Supabase query failed:", error.message);
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }

    return Response.json({ 
      ok: true, 
      message: "Supabase pinged successfully", 
      timestamp: new Date().toISOString() 
    });
  } catch (err) {
    console.error("[Ping] Internal error:", err.message);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
