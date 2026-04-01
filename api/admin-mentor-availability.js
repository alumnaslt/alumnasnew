const { methodNotAllowed, sendJson } = require("../lib/http");
const { listMentorAvailabilitySubmissions } = require("../lib/mentor-availability-store");

module.exports = async function adminMentorAvailabilityHandler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  try {
    const items = await listMentorAvailabilitySubmissions();
    return sendJson(res, 200, { items });
  } catch (error) {
    return sendJson(res, 500, {
      error: "Nepavyko užkrauti mentorių laikų suvestinės."
    });
  }
};
