const { sendAdminBookingEmail, sendStudentBookingEmail } = require("./email");
const { createGoogleMeetEvent, hasGoogleCalendarConfig } = require("./google-calendar");
const {
  getBookingWithRelations,
  markBookingEmailsSent,
  markBookingMeetingDetails
} = require("./store");

async function ensureBookingFollowup(sessionId) {
  let result = await getBookingWithRelations({
    sessionId
  });

  if (!result || !result.booking || result.booking.paymentStatus !== "paid") {
    return result;
  }

  if (!result.booking.meetingUrl && hasGoogleCalendarConfig()) {
    try {
      const meetingDetails = await createGoogleMeetEvent(result);

      if (meetingDetails) {
        await markBookingMeetingDetails({
          sessionId,
          ...meetingDetails
        });

        result = await getBookingWithRelations({
          sessionId
        });
      }
    } catch (error) {
      result.booking.meetingError = error.message || "Nepavyko sukurti Google Meet nuorodos.";
    }
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

    result = await getBookingWithRelations({
      sessionId
    });
  }

  return result;
}

module.exports = {
  ensureBookingFollowup
};
