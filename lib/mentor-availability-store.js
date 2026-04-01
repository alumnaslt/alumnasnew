const crypto = require("crypto");
const { findMentor, mentors } = require("./mentors-data");
const { readState, withStateLock, writeState } = require("./state-store");

function createId(prefix) {
  if (typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function createInitialState() {
  return {
    mentorAvailabilitySubmissions: []
  };
}

function ensureAvailabilityState(state) {
  if (!Array.isArray(state.mentorAvailabilitySubmissions)) {
    state.mentorAvailabilitySubmissions = [];
  }

  return state;
}

function sortSlots(slots) {
  return [...slots].sort((left, right) => {
    const leftKey = `${left.date} ${left.time}`;
    const rightKey = `${right.date} ${right.time}`;
    return leftKey.localeCompare(rightKey, "lt");
  });
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function getSlotsForDate(date) {
  const day = date.getDay();
  const slots = [];

  if (day === 0 || day === 6) {
    for (let hour = 8; hour <= 22; hour += 1) {
      slots.push(`${String(hour).padStart(2, "0")}:00`);
    }

    return slots;
  }

  for (let hour = 16; hour <= 21; hour += 1) {
    slots.push(`${String(hour).padStart(2, "0")}:00`);
    slots.push(`${String(hour).padStart(2, "0")}:30`);
  }

  slots.push("22:00");

  return slots;
}

function buildDateOptions(period = "week") {
  const totalDays = period === "month" ? 30 : 14;
  const dates = [];
  const start = new Date();
  start.setHours(12, 0, 0, 0);

  for (let offset = 0; offset < totalDays; offset += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);

    dates.push({
      date: formatDate(date),
      dayLabel: new Intl.DateTimeFormat("lt-LT", { weekday: "long" }).format(date),
      shortLabel: new Intl.DateTimeFormat("lt-LT", {
        month: "2-digit",
        day: "2-digit"
      }).format(date),
      times: getSlotsForDate(date)
    });
  }

  return dates;
}

async function getMentorAvailabilityConfig(mentorId, period = "week") {
  const mentor = findMentor(mentorId);

  if (!mentor) {
    return null;
  }

  const latestSubmission = await getLatestMentorAvailabilitySubmission(mentorId);

  return {
    mentor: {
      id: mentor.id,
      name: mentor.name,
      studyProgram: mentor.studyProgram,
      university: mentor.university
    },
    period,
    dates: buildDateOptions(period),
    latestSubmission
  };
}

async function saveMentorAvailabilitySubmission({
  mentorId,
  period,
  notes,
  selectedSlots
}) {
  return withStateLock(async () => {
    const state = ensureAvailabilityState(await readState(createInitialState));
    const mentor = findMentor(mentorId);

    if (!mentor) {
      throw new Error("Mentorius nerastas.");
    }

    const normalizedSlots = sortSlots(
      (Array.isArray(selectedSlots) ? selectedSlots : []).filter((slot) => slot && slot.date && slot.time)
    );

    const submission = {
      id: createId("mentor_availability"),
      mentorId,
      mentorName: mentor.name,
      period: period === "month" ? "month" : "week",
      notes: notes ? String(notes).trim() : "",
      selectedSlots: normalizedSlots,
      submittedAt: new Date().toISOString()
    };

    state.mentorAvailabilitySubmissions.push(submission);

    if (state.mentorAvailabilitySubmissions.length > 500) {
      state.mentorAvailabilitySubmissions = state.mentorAvailabilitySubmissions.slice(-500);
    }

    await writeState(state);

    return submission;
  });
}

async function getLatestMentorAvailabilitySubmission(mentorId) {
  const state = ensureAvailabilityState(await readState(createInitialState));
  const submissions = state.mentorAvailabilitySubmissions
    .filter((item) => item.mentorId === mentorId)
    .sort((left, right) => String(right.submittedAt).localeCompare(String(left.submittedAt), "lt"));

  return submissions[0] || null;
}

async function listMentorAvailabilitySubmissions() {
  const state = ensureAvailabilityState(await readState(createInitialState));

  return mentors.map((mentor) => {
    const submissions = state.mentorAvailabilitySubmissions
      .filter((item) => item.mentorId === mentor.id)
      .sort((left, right) => String(right.submittedAt).localeCompare(String(left.submittedAt), "lt"));

    return {
      mentor: {
        id: mentor.id,
        name: mentor.name,
        studyProgram: mentor.studyProgram,
        university: mentor.university
      },
      latestSubmission: submissions[0] || null,
      submissionCount: submissions.length
    };
  });
}

module.exports = {
  getMentorAvailabilityConfig,
  listMentorAvailabilitySubmissions,
  saveMentorAvailabilitySubmission
};
