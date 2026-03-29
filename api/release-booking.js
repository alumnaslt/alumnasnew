const { methodNotAllowed, readJsonBody, sendJson } = require("../lib/http");
const { releaseBookingHold } = require("../lib/store");

module.exports = async function releaseBookingHandler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  try {
    const { bookingId, sessionId } = await readJsonBody(req);

    await releaseBookingHold({
      bookingId,
      sessionId
    });

    return sendJson(res, 200, {
      released: true
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: "Nepavyko atlaisvinti rezervacijos."
    });
  }
};
