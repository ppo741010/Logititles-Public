import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { user_id, plan } = req.body;

    if (!user_id || !plan) {
      return res.status(400).json({ error: "Missing user_id or plan" });
    }

    // Check if record exists
    const { data: existing } = await supabase
      .from("user_plans")
      .select("*")
      .eq("user_id", user_id)
      .single();

    if (existing) {
      // Update
      const { data, error } = await supabase
        .from("user_plans")
        .update({ plan })
        .eq("user_id", user_id)
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ success: true, action: "updated", data });
    } else {
      // Insert
      const { data, error } = await supabase
        .from("user_plans")
        .insert({
          user_id,
          plan,
          bulk_used: 0,
          ai_used: 0,
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ success: true, action: "created", data });
    }
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
