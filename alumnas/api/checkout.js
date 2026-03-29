const { getBaseUrl, methodNotAllowed, readJsonBody, sendJson } = require("../lib/http");
const { createCheckoutSession } = require("../lib/stripe");
const {
  attachStripeSession,
  holdDurationMs,
  releaseBookingHold,
  reserveSlotForCheckout
} = require("../lib/store");

module.exports = async function checkoutHandler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  try {
    const { mentorId, slotId, studentName, studentEmail } = await readJsonBody(req);

    if (!mentorId || !slotId || !studentName || !studentEmail) {
      return sendJson(res, 400, {
        error: "Trūksta rezervacijos informacijos."
      });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return sendJson(res, 500, {
        error: "Stripe raktas dar nesukonfigūruotas."
      });
    }

    const reservation = await reserveSlotForCheckout({
      mentorId,
      slotId,
      studentName,
      studentEmail
    });
    const baseUrl = getBaseUrl(req);
    const stripeParams = new URLSearchParams();

    stripeParams.append("mode", "payment");
    stripeParams.append("success_url", `${baseUrl}/rezervacija-patvirtinta?session_id={CHECKOUT_SESSION_ID}`);
    stripeParams.append("cancel_url", `${baseUrl}/rezervacija-atsaukta?booking_id=${encodeURIComponent(reservation.booking.id)}`);
    stripeParams.append("customer_email", studentEmail);
    stripeParams.append("expires_at", String(Math.floor(Date.now() / 1000) + Math.floor(holdDurationMs / 1000)));
    stripeParams.append("metadata[mentorId]", reservation.mentor.id);
    stripeParams.append("metadata[slotId]", reservation.slot.id);
    stripeParams.append("metadata[bookingId]", reservation.booking.id);
    stripeParams.append("line_items[0][quantity]", "1");
    stripeParams.append("line_items[0][price_data][currency]", "eur");
    stripeParams.append("line_items[0][price_data][unit_amount]", String(reservation.mentor.price));
    stripeParams.append(
      "line_items[0][price_data][product_data][name]",
      `ALUMNAS konsultacija su ${reservation.mentor.name}`
    );
    stripeParams.append(
      "line_items[0][price_data][product_data][description]",
      `${reservation.mentor.university} ${reservation.mentor.studyProgram} • ${reservation.slot.date} ${reservation.slot.time}`
    );

    try {
      const session = await createCheckoutSession({
        secretKey: process.env.STRIPE_SECRET_KEY,
        params: stripeParams
      });

      await attachStripeSession({
        bookingId: reservation.booking.id,
        sessionId: session.id
      });

      return sendJson(res, 200, {
        bookingId: reservation.booking.id,
        checkoutUrl: session.url
      });
    } catch (error) {
      await releaseBookingHold({
        bookingId: reservation.booking.id
      });

      throw error;
    }
  } catch (error) {
    return sendJson(res, error.statusCode || 500, {
      error: error.message || "Nepavyko pradėti apmokėjimo."
    });
  }
};
