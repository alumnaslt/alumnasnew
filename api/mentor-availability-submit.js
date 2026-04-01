const { methodNotAllowed, readJsonBody, sendJson } = require("../lib/http");
const { saveMentorAvailabilitySubmission } = require("../lib/mentor-availability-store");

module.exports = async function mentorAvailabilitySubmitHandler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  try {
    const { mentorId, period, notes, selectedSlots } = await readJsonBody(req);

    if (!mentorId) {
      return sendJson(res, 400, {
        error: "Trūksta mentoriaus identifikatoriaus."
      });
    }

    const submission = await saveMentorAvailabilitySubmission({
      mentorId,
      period,
      notes,
      selectedSlots
    });

    return sendJson(res, 200, {
      ok: true,
      submission
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: error.message || "Nepavyko išsaugoti mentoriaus laikų."
    });
  }
};
