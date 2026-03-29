const mentors = require("../data/mentors.json");
const slotBlueprints = require("../data/mentor-slot-blueprints.json");

function createDateString(dayOffset) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

function createSeedSlots() {
  return mentors.flatMap((mentor) => {
    return (slotBlueprints[mentor.id] || []).flatMap((template) => {
      const date = createDateString(template.dayOffset);

      return template.times.map((time) => ({
        id: `${mentor.id}-${date}-${time.replace(":", "-")}`,
        mentorId: mentor.id,
        date,
        time,
        isBooked: false,
        bookedBookingId: null,
        bookedAt: null,
        holdBookingId: null,
        holdUntil: null
      }));
    });
  });
}

function findMentor(mentorId) {
  return mentors.find((mentor) => mentor.id === mentorId) || null;
}

module.exports = {
  createSeedSlots,
  findMentor,
  mentors
};
