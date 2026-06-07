import { supabaseAdmin } from "@/lib/supabase";
import { getUser } from "@/lib/auth-utils";
import { META_API_VERSION } from "@/lib/config";

// Simple in-memory rate limiter
const rateLimitMap = new Map();

export async function POST(request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });

    // Rate Limiting Logic (100 per minute)
    const now = Date.now();
    const userLimit = rateLimitMap.get(user.id) || { count: 0, reset: now + 60000 };
    if (now > userLimit.reset) {
      userLimit.count = 0;
      userLimit.reset = now + 60000;
    }
    userLimit.count++;
    rateLimitMap.set(user.id, userLimit);
    if (userLimit.count > 100) {
      return Response.json({ success: false, error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
    }

    const body = await request.json();
    const { phone, name, marks, test, date, customToken, customPhoneId, customTemplate, params } = body;
    
    const admin = supabaseAdmin();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("whatsapp_token, phone_number_id, template_name, is_active")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) return Response.json({ success: false, error: "Profile not found" }, { status: 404 });
    if (!profile.is_active) return Response.json({ success: false, error: "Account inactive" }, { status: 403 });

    const whatsapp_token = (customToken || profile.whatsapp_token || "").trim();
    const phone_number_id = (customPhoneId || profile.phone_number_id || "").trim();
    const template_name = (customTemplate || profile.template_name || "marks_update").trim();
    
    if (!whatsapp_token || !phone_number_id)
      return Response.json({ success: false, error: "WhatsApp credentials not configured." }, { status: 400 });

    // Construct parameters
    let finalParams = [];
    if (params) {
      if (Array.isArray(params)) {
        // Handle Indexed Parameters: {{1}}, {{2}}
        finalParams = params.map(p => ({ 
          type: "text", 
          text: String(p || " ").trim() || " "
        }));
      } else if (typeof params === "object") {
        // Handle Named Parameters: {{student_name}}, {{marks}}
        finalParams = Object.entries(params).map(([key, val]) => ({
          type: "text",
          parameter_name: key,
          text: String(val || " ").trim() || " "
        }));
      }
    } else {
      // Legacy fallback
      finalParams = [name, marks, test, date].map(v => ({ 
        type: "text", 
        text: String(v || " ").trim() || " " 
      }));
    }

    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: template_name,
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: finalParams,
          }
        ],
      },
    };

    const metaRes = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${phone_number_id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${whatsapp_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await metaRes.json();
    if (!metaRes.ok) {
      // Stringify the error details so the user can see exactly what Meta is complaining about
      const metaError = data.error?.error_data?.details || data.error?.message || "Unknown Meta Error";
      return Response.json({ 
        success: false, 
        error: `WhatsApp Error: ${metaError}`,
        details: data
      }, { status: metaRes.status });
    }
    return Response.json({ success: true, data });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
