const { methodNotAllowed, sendJson } = require("../lib/http");
const { getMentorsWithAvailability } = require("../lib/store");

module.exports = async function mentorsHandler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  try {
    const mentors = await getMentorsWithAvailability();
    return sendJson(res, 200, {
      mentors
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: "Nepavyko užkrauti mentorių."
    });
  }
};
