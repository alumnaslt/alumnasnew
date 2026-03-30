const { getQueryParam, methodNotAllowed, sendJson } = require("../lib/http");
const { sendAdminBookingEmail, sendStudentBookingEmail } = require("../lib/email");
const { getCheckoutSession } = require("../lib/stripe");
const {
  getBookingWithRelations,
  markBookingEmailsSent,
  markBookingPaid
} = require("../lib/store");

async function sendBookingEmailsIfNeeded(sessionId) {
  const result = await getBookingWithRelations({
    sessionId
  });

  if (!result || !result.booking || result.booking.paymentStatus !== "paid") {
    return result;
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

    return getBookingWithRelations({
      sessionId
    });
  }

  return result;
}

module.exports = async function bookingConfirmationHandler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  try {
    const sessionId = getQueryParam(req, "session_id");
    const bookingId = getQueryParam(req, "booking_id");

    if (!sessionId && !bookingId) {
      return sendJson(res, 400, {
        error: "Trūksta rezervacijos identifikatoriaus."
      });
    }

    let result = await getBookingWithRelations({
      sessionId,
      bookingId
    });

    if (!result) {
      return sendJson(res, 404, {
        error: "Rezervacija nerasta."
      });
    }

    // Jei webhookas dar nespėjo suveikti, success puslapis pats pasitikrina Stripe sesiją.
    if (
      sessionId &&
      result.booking.paymentStatus === "pending" &&
      process.env.STRIPE_SECRET_KEY
    ) {
      const session = await getCheckoutSession({
        secretKey: process.env.STRIPE_SECRET_KEY,
        sessionId
      });

      if (session.payment_status === "paid" || session.status === "complete") {
        await markBookingPaid({
          sessionId,
          paymentIntentId: session.payment_intent || null
        });

        try {
          result = await sendBookingEmailsIfNeeded(sessionId);
        } catch (error) {
          console.error("Nepavyko išsiųsti rezervacijos laiškų.", error);
          result = await getBookingWithRelations({
            sessionId
          });
        }
      }
    }

    return sendJson(res, 200, {
      booking: {
        id: result.booking.id,
        studentName: result.booking.studentName,
        studentEmail: result.booking.studentEmail
      },
      mentor: result.mentor,
      slot: result.slot,
      paymentStatus: result.booking.paymentStatus
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: error.message || "Nepavyko gauti rezervacijos informacijos."
    });
  }
};
