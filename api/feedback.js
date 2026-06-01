import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { toolName, testInput, didMakeSense, feedback } = req.body;

    if (!toolName || !testInput || !feedback) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 1. Save to Supabase
    const { error: dbError } = await supabase.from("feedback").insert([
      {
        tool_name: toolName,
        test_input: testInput,
        made_sense: didMakeSense,
        feedback_text: feedback,
        submitted_at: new Date().toISOString(),
      },
    ]);

    if (dbError) {
      console.error("Supabase error:", dbError);
      // Still continue even if DB fails, but log it
    }

    // 2. Send email via Resend
    try {
      await resend.emails.send({
        from: "feedback@logititles.com",
        to: "logititles@gmail.com",
        subject: `[Feedback] ${toolName} - ${testInput.slice(0, 30)}`,
        html: `
          <h2>New Feedback Submitted</h2>
          <p><strong>Tool:</strong> ${toolName}</p>
          <p><strong>What was tested:</strong> ${testInput}</p>
          <p><strong>Did it make sense:</strong> ${didMakeSense}</p>
          <h3>Feedback:</h3>
          <p>${feedback.replace(/\n/g, "<br>")}</p>
          <hr>
          <p><small>Submitted: ${new Date().toISOString()}</small></p>
        `,
      });
    } catch (emailError) {
      console.error("Email sending error:", emailError);
      // Still return success if DB saved
      if (!dbError) {
        return res.status(200).json({ success: true, emailError: "Email notification failed but feedback saved" });
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
