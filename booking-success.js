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

async function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function loadConfirmation(sessionId) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(`./api/booking-confirmation?session_id=${encodeURIComponent(sessionId)}`);
    const result = await response.json().catch(() => ({}));

    if (response.ok && result.paymentStatus === "paid") {
      return result;
    }

    if (response.ok && result.paymentStatus === "pending") {
      await wait(1500);
      continue;
    }

    if (!response.ok) {
      throw new Error(result.error || "Nepavyko gauti rezervacijos informacijos.");
    }
  }

  throw new Error("Apmokėjimas dar apdorojamas. Po kelių akimirkų pabandyk atnaujinti puslapį.");
}

async function initSuccessPage() {
  const card = document.getElementById("booking-success-card");
  const sessionId = new URLSearchParams(window.location.search).get("session_id");

  if (!sessionId) {
    card.innerHTML = `
      <p class="eyebrow">Rezervacija</p>
      <h1>Rezervacija užfiksuota</h1>
      <p class="booking-result-copy">
        Jei ką tik atlikai apmokėjimą, grįžk į mentorių puslapį arba patikrink el. paštą.
      </p>
      <a class="button button-primary booking-result-button" href="./mentoriai.html">Grįžti į mentorius</a>
    `;
    return;
  }

  try {
    const result = await loadConfirmation(sessionId);

    card.innerHTML = `
      <p class="eyebrow">Rezervacija patvirtinta</p>
      <h1>${escapeHtml(result.mentor.name)} laikas jau rezervuotas</h1>
      <p class="booking-result-copy">
        Konsultacija suplanuota ${escapeHtml(formatLongDate(result.slot.date))} ${escapeHtml(result.slot.time)}.
      </p>

      <div class="booking-result-details">
        <div>
          <span>Mentorius</span>
          <strong>${escapeHtml(result.mentor.name)}, ${escapeHtml(result.mentor.university)} ${escapeHtml(result.mentor.studyProgram)}</strong>
        </div>
        <div>
          <span>Trukmė</span>
          <strong>${escapeHtml(result.mentor.duration)} min</strong>
        </div>
        <div>
          <span>El. paštas</span>
          <strong>${escapeHtml(result.booking.studentEmail)}</strong>
        </div>
      </div>

      <div class="booking-result-actions">
        <a class="button button-primary booking-result-button" href="./mentoriai.html">Grįžti į mentorius</a>
        <a class="button button-secondary booking-result-button" href="mailto:info@alumnas.lt">Susisiekti</a>
      </div>
    `;
  } catch (error) {
    card.innerHTML = `
      <p class="eyebrow">Rezervacija</p>
      <h1>Apmokėjimas dar tikrinamas</h1>
      <p class="booking-result-copy">${escapeHtml(error.message || "Patikrink šį puslapį dar kartą po kelių akimirkų.")}</p>
      <a class="button button-primary booking-result-button" href="./mentoriai.html">Grįžti į mentorius</a>
    `;
  }
}

initSuccessPage();
