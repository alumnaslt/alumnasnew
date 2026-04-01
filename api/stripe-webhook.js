const { methodNotAllowed, readRawBody, sendJson } = require("../lib/http");
const { ensureBookingFollowup } = require("../lib/booking-followup");
const { verifyStripeSignature } = require("../lib/stripe");
const { markBookingPaid, releaseBookingHold } = require("../lib/store");

module.exports = async function stripeWebhookHandler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  try {
    const rawBody = await readRawBody(req);
    const signatureHeader = req.headers["stripe-signature"];

    if (process.env.STRIPE_WEBHOOK_SECRET) {
      const validSignature = verifyStripeSignature({
        rawBody,
        signatureHeader,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
      });

      if (!validSignature) {
        return sendJson(res, 400, {
          error: "Neteisingas Stripe parašas."
        });
      }
    }

    const event = JSON.parse(rawBody || "{}");

    const eventObject = event && event.data ? event.data.object : null;

    if (event.type === "checkout.session.completed" && eventObject && eventObject.id) {
      await markBookingPaid({
        sessionId: eventObject.id,
        paymentIntentId: eventObject.payment_intent || null
      });

      try {
        await ensureBookingFollowup(eventObject.id);
      } catch (error) {
        console.error("Nepavyko užbaigti rezervacijos follow-up veiksmų.", error);
      }
    }

    if (event.type === "checkout.session.expired" && eventObject && eventObject.id) {
      await releaseBookingHold({
        sessionId: eventObject.id
      });
    }

    return sendJson(res, 200, {
      received: true
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: "Nepavyko apdoroti Stripe webhook."
    });
  }
};
