async function initCancelPage() {
  const card = document.getElementById("booking-cancel-card");
  const params = new URLSearchParams(window.location.search);
  const bookingId = params.get("booking_id");
  const sessionId = params.get("session_id");

  if (bookingId || sessionId) {
    try {
      await fetch("./api/release-booking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          bookingId,
          sessionId
        })
      });
    } catch (error) {
      // Jei nepavyksta atlaisvinti is karto, laikina rezervacija vis tiek baigsis automatiskai.
    }
  }

  card.innerHTML = `
    <p class="eyebrow">Rezervacija</p>
    <h1>Rezervacija nebuvo užbaigta</h1>
    <p class="booking-result-copy">
      Pasirinktas laikas nebuvo aktyvuotas, todėl gali grįžti ir pasirinkti kitą konsultacijos laiką.
    </p>
    <div class="booking-result-actions">
      <a class="button button-primary booking-result-button" href="./mentoriai.html">Grįžti į mentorius</a>
      <a class="button button-secondary booking-result-button" href="./index.html">Į pradžią</a>
    </div>
  `;
}

initCancelPage();
