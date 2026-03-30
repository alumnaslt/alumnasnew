const { methodNotAllowed, readRawBody, sendJson } = require("../lib/http");
const { sendAdminBookingEmail, sendStudentBookingEmail } = require("../lib/email");
const { verifyStripeSignature } = require("../lib/stripe");
const {
  getBookingWithRelations,
  markBookingEmailsSent,
  markBookingPaid,
  releaseBookingHold
} = require("../lib/store");

async function sendBookingEmailsIfNeeded(sessionId) {
  const result = await getBookingWithRelations({
    sessionId
  });

  if (!result || !result.booking || result.booking.paymentStatus !== "paid") {
    return;
  }

  const now = new Date().toISOString();
  const updates = {};

  if (!result.booking.adminEmailSentAt) {
    const adminSent = await sendAdminBookingEmail(result);

    if (adminSent) {
      updates.adminEmailSentAt = now;
    }
  }

  if (!result.booking.studentEmailSentAt) {
    const studentSent = await sendStudentBookingEmail(result);

    if (studentSent) {
      updates.studentEmailSentAt = now;
    }
  }

  if (updates.adminEmailSentAt || updates.studentEmailSentAt) {
    await markBookingEmailsSent({
      sessionId,
      ...updates
    });
  }
}

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
        await sendBookingEmailsIfNeeded(eventObject.id);
      } catch (error) {
        console.error("Nepavyko išsiųsti rezervacijos laiškų.", error);
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
