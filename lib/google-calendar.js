const crypto = require("crypto");

function hasGoogleCalendarConfig() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN &&
    process.env.GOOGLE_CALENDAR_ID
  );
}

async function getGoogleAccessToken() {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN || "",
    grant_type: "refresh_token"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.access_token) {
    const message = payload && payload.error_description
      ? payload.error_description
      : "Nepavyko gauti Google prieigos rakto.";
    throw new Error(message);
  }

  return payload.access_token;
}

function buildSessionTimes(slot) {
  const timeZone = process.env.ALUMNAS_TIMEZONE || "Europe/Vilnius";
  const durationMinutes = Number(process.env.ALUMNAS_SESSION_DURATION_MINUTES || "45");
  const startDate = new Date(`${slot.date}T${slot.time}:00+03:00`);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

  return {
    timeZone,
    startDateTime: startDate.toISOString(),
    endDateTime: endDate.toISOString()
  };
}

async function createGoogleMeetEvent({ booking, mentor, slot }) {
  if (!hasGoogleCalendarConfig()) {
    return null;
  }

  const accessToken = await getGoogleAccessToken();
  const { timeZone, startDateTime, endDateTime } = buildSessionTimes(slot);
  const conferenceRequestId =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : crypto.randomBytes(12).toString("hex");

  const body = {
    summary: `ALUMNAS konsultacija su ${mentor.name}`,
    description: [
      `Mokinys: ${booking.studentName}`,
      `Mokinio el. paštas: ${booking.studentEmail}`,
      `Studijų kryptis: ${mentor.studyProgram}, ${mentor.university}`
    ].join("\n"),
    start: {
      dateTime: startDateTime,
      timeZone
    },
    end: {
      dateTime: endDateTime,
      timeZone
    },
    conferenceData: {
      createRequest: {
        requestId: conferenceRequestId,
        conferenceSolutionKey: {
          type: "hangoutsMeet"
        }
      }
    }
  };

  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID);
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=none`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload && payload.error && payload.error.message
      ? payload.error.message
      : "Nepavyko sukurti Google Meet susitikimo.";
    throw new Error(message);
  }

  const meetingUrl =
    payload.hangoutLink ||
    (payload.conferenceData &&
    Array.isArray(payload.conferenceData.entryPoints)
      ? payload.conferenceData.entryPoints.find((item) => item.entryPointType === "video")?.uri
      : null);

  return {
    googleCalendarEventId: payload.id || null,
    meetingProvider: "google-meet",
    meetingUrl: meetingUrl || null,
    meetingCreatedAt: new Date().toISOString()
  };
}

module.exports = {
  createGoogleMeetEvent,
  hasGoogleCalendarConfig
};
