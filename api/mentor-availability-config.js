const { getQueryParam, methodNotAllowed, sendJson } = require("../lib/http");
const { getMentorAvailabilityConfig } = require("../lib/mentor-availability-store");

module.exports = async function mentorAvailabilityConfigHandler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  try {
    const mentorId = getQueryParam(req, "mentor");
    const period = getQueryParam(req, "period") || "week";

    if (!mentorId) {
      return sendJson(res, 400, {
        error: "Trūksta mentoriaus identifikatoriaus."
      });
    }

    const config = await getMentorAvailabilityConfig(mentorId, period);

    if (!config) {
      return sendJson(res, 404, {
        error: "Mentorius nerastas."
      });
    }

    return sendJson(res, 200, config);
  } catch (error) {
    return sendJson(res, 500, {
      error: "Nepavyko užkrauti mentoriaus laikų formos."
    });
  }
};
