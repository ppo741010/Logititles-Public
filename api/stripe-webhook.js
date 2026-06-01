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
    const paymentLink = session.payment_link;

    // Determine plan from amount (NZ$9 = 900 cents = basic, NZ$29 = 2900 cents = pro)
    // TODO: replace with payment link ID check once confirmed from Stripe dashboard
    let newPlan = null;
    if (session.amount_total < 2000) newPlan = "basic";
    else newPlan = "pro";

    if (!email) return res.status(200).json({ received: true });

    // Look up user by email without fetching all users
    const { data: { users }, error } = await supabase.auth.admin.listUsers({
      page: 1, perPage: 50,
    });
    // listUsers doesn't support email filter — find in first batch
    // For small user base this is fine; revisit if user count grows
    let user = users?.find((u) => u.email === email);

    // If not found in first 50, do a broader search
    if (!user) {
      const { data: { users: allUsers } } = await supabase.auth.admin.listUsers({
        page: 1, perPage: 1000,
      });
      user = allUsers?.find((u) => u.email === email);
    }

    if (user && newPlan) {
      await supabase
        .from("user_plans")
        .update({
          plan: newPlan,
          bulk_used: 0,
          ai_used: 0,
          current_period_end: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
          ).toISOString(),
        })
        .eq("user_id", user.id);
    }
  }

  res.status(200).json({ received: true });
}
