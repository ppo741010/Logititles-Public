import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawBody = await getRawBody(req);
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_details?.email;
    const amountTotal = session.amount_total; // in cents

    if (email) {
      const { data: users } = await supabase.auth.admin.listUsers();
      const user = users?.users?.find((u) => u.email === email);

      if (user) {
        // NZ$9 = Basic, NZ$29 = Pro (amount_total is in cents)
        const newPlan = amountTotal <= 1000 ? "basic" : "pro";
        await supabase
          .from("user_plans")
          .update({
            plan: newPlan,
            current_period_end: new Date(
              Date.now() + 30 * 24 * 60 * 60 * 1000
            ).toISOString(),
          })
          .eq("user_id", user.id);
      }
    }
  }

  res.status(200).json({ received: true });
}
