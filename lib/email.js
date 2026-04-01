function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatLongDate(dateString) {
  return new Intl.DateTimeFormat("lt-LT", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date(`${dateString}T12:00:00`));
}

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALUMNAS_EMAIL_FROM || "ALUMNAS <onboarding@resend.dev>";

  if (!apiKey || !to) {
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload && payload.message ? payload.message : "Nepavyko išsiųsti laiško.";
    throw new Error(message);
  }

  return true;
}

async function sendAdminBookingEmail({ booking, mentor, slot }) {
  const adminEmail = process.env.ALUMNAS_ADMIN_EMAIL || "stankevicius.kajus@gmail.com";
  const sessionDate = formatLongDate(slot.date);
  const subject = `Nauja ALUMNAS rezervacija: ${mentor.name} ${slot.date} ${slot.time}`;
  const meetingMarkup = booking.meetingUrl
    ? `<li><strong>Prisijungimo nuoroda:</strong> <a href="${escapeHtml(booking.meetingUrl)}">${escapeHtml(booking.meetingUrl)}</a></li>`
    : "";
  const meetingWarning = booking.meetingError
    ? `<p><strong>Dėmesio:</strong> Google Meet nuorodos automatiškai sukurti nepavyko: ${escapeHtml(booking.meetingError)}</p>`
    : "";
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="margin-bottom: 12px;">Gavai naują rezervaciją</h2>
      <p>Rezervacija sėkmingai apmokėta per ALUMNAS.</p>
      <ul>
        <li><strong>Mentorius:</strong> ${escapeHtml(mentor.name)}</li>
        <li><strong>Studijų kryptis:</strong> ${escapeHtml(mentor.studyProgram)}, ${escapeHtml(mentor.university)}</li>
        <li><strong>Laikas:</strong> ${escapeHtml(sessionDate)} ${escapeHtml(slot.time)}</li>
        <li><strong>Mokinys:</strong> ${escapeHtml(booking.studentName)}</li>
        <li><strong>Mokinio el. paštas:</strong> ${escapeHtml(booking.studentEmail)}</li>
        ${meetingMarkup}
      </ul>
      ${meetingWarning}
      <p>Vėliau galėsi su juo susisiekti dėl tolimesnių žingsnių.</p>
    </div>
  `;

  return sendEmail({
    to: adminEmail,
    subject,
    html
  });
}

async function sendStudentBookingEmail({ booking, mentor, slot }) {
  const sessionDate = formatLongDate(slot.date);
  const subject = "Tavo ALUMNAS rezervacija patvirtinta";
  const meetingSection = booking.meetingUrl
    ? `
      <p>
        Prisijungimo nuoroda į konsultaciją:
        <br />
        <a href="${escapeHtml(booking.meetingUrl)}">${escapeHtml(booking.meetingUrl)}</a>
      </p>
    `
    : `
      <p>Prisijungimo nuoroda bus atsiųsta atskirai, jei jos dar nematai šiame laiške.</p>
    `;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="margin-bottom: 12px;">Tavo rezervacija patvirtinta</h2>
      <p>Labai ačiū, kad pasirinkai ALUMNAS. Tavo rezervacija sėkmingai patvirtinta.</p>
      <ul>
        <li><strong>Mentorius:</strong> ${escapeHtml(mentor.name)}</li>
        <li><strong>Studijų kryptis:</strong> ${escapeHtml(mentor.studyProgram)}, ${escapeHtml(mentor.university)}</li>
        <li><strong>Laikas:</strong> ${escapeHtml(sessionDate)} ${escapeHtml(slot.time)}</li>
        <li><strong>Trukmė:</strong> ${escapeHtml(mentor.duration)} min.</li>
      </ul>
      ${meetingSection}
      <p>Dėkojame už pasitikėjimą. Jei reikės, susisieksime su tavimi tuo pačiu el. paštu.</p>
      <p>Iki pasimatymo,<br />ALUMNAS komanda</p>
    </div>
  `;

  return sendEmail({
    to: booking.studentEmail,
    subject,
    html
  });
}

module.exports = {
  sendAdminBookingEmail,
  sendStudentBookingEmail
};
