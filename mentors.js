const searchInput = document.getElementById("mentor-search");
const programFilter = document.getElementById("mentor-program-filter");
const universityFilter = document.getElementById("mentor-university-filter");
const resetFiltersButton = document.getElementById("mentor-reset-filters");
const resultsCopy = document.getElementById("mentor-results-copy");
const mentorGrid = document.getElementById("mentoriu-sarasas");
const emptyState = document.getElementById("mentor-empty-state");
const statusBanner = document.getElementById("mentor-booking-status");
const bookingModal = document.getElementById("booking-modal");
const bookingModalBackdrop = document.getElementById("booking-modal-backdrop");
const bookingModalClose = document.getElementById("booking-modal-close");
const bookingModalContent = document.getElementById("booking-modal-content");

const directoryState = {
  mentors: [],
  apiAvailable: false,
  query: "",
  program: "",
  university: ""
};

const bookingState = {
  activeMentorId: "",
  activeDate: "",
  activeSlotId: "",
  studentName: "",
  studentEmail: "",
  submitting: false
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function createDateString(dayOffset) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

function buildFallbackMentors(mentorSeeds, slotBlueprints) {
  return mentorSeeds.map((mentor) => {
    const templates = slotBlueprints[mentor.id] || [];
    const slots = templates.flatMap((template) => {
      const date = createDateString(template.dayOffset);
      return template.times.map((time) => ({
        id: `${mentor.id}-${date}-${time.replace(":", "-")}`,
        mentorId: mentor.id,
        date,
        time,
        isBooked: false
      }));
    });

    return {
      ...mentor,
      slots
    };
  });
}

async function loadFallbackMentors() {
  if (Array.isArray(window.ALUMNAS_MENTOR_SEEDS) && window.ALUMNAS_SLOT_BLUEPRINTS) {
    return buildFallbackMentors(window.ALUMNAS_MENTOR_SEEDS, window.ALUMNAS_SLOT_BLUEPRINTS);
  }

  const [mentorsResponse, slotBlueprintsResponse] = await Promise.all([
    fetch("./data/mentors.json", {
      headers: {
        Accept: "application/json"
      }
    }),
    fetch("./data/mentor-slot-blueprints.json", {
      headers: {
        Accept: "application/json"
      }
    })
  ]);

  if (!mentorsResponse.ok || !slotBlueprintsResponse.ok) {
    throw new Error("Nepavyko užkrauti demonstracinių mentorių duomenų.");
  }

  const mentorSeeds = await mentorsResponse.json();
  const slotBlueprints = await slotBlueprintsResponse.json();

  if (!Array.isArray(mentorSeeds) || !slotBlueprints || typeof slotBlueprints !== "object") {
    throw new Error("Netinkami demonstraciniai mentorių duomenys.");
  }

  return buildFallbackMentors(mentorSeeds, slotBlueprints);
}

function formatPrice(cents) {
  return new Intl.NumberFormat("lt-LT", {
    style: "currency",
    currency: "EUR"
  }).format(cents / 100);
}

function formatShortDate(dateString) {
  return new Intl.DateTimeFormat("lt-LT", {
    weekday: "short",
    day: "numeric",
    month: "short"
  }).format(new Date(`${dateString}T12:00:00`));
}

function formatLongDate(dateString) {
  return new Intl.DateTimeFormat("lt-LT", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date(`${dateString}T12:00:00`));
}

function readDirectoryStateFromUrl() {
  const params = new URLSearchParams(window.location.search);

  directoryState.query = params.get("q") || "";
  directoryState.program = params.get("program") || "";
  directoryState.university = params.get("university") || "";
}

function writeDirectoryStateToUrl() {
  const params = new URLSearchParams();

  if (directoryState.query) {
    params.set("q", directoryState.query);
  }

  if (directoryState.program) {
    params.set("program", directoryState.program);
  }

  if (directoryState.university) {
    params.set("university", directoryState.university);
  }

  const queryString = params.toString();
  const nextUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;

  window.history.replaceState({}, "", nextUrl);
}

function fillSelect(selectNode, values, defaultLabel, selectedValue) {
  const optionsMarkup = values
    .map((value) => {
      const isSelected = value === selectedValue ? ' selected="selected"' : "";
      return `<option value="${escapeHtml(value)}"${isSelected}>${escapeHtml(value)}</option>`;
    })
    .join("");

  selectNode.innerHTML = `<option value="">${defaultLabel}</option>${optionsMarkup}`;
}

function setStatus(message, tone = "info") {
  if (!message) {
    statusBanner.hidden = true;
    statusBanner.textContent = "";
    statusBanner.removeAttribute("data-tone");
    return;
  }

  statusBanner.hidden = false;
  statusBanner.dataset.tone = tone;
  statusBanner.textContent = message;
}

function sortSlots(left, right) {
  return `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`, "lt");
}

function getVisibleSlots(mentor) {
  return (mentor.slots || [])
    .filter((slot) => !slot.isBooked)
    .sort(sortSlots);
}

function getSearchableText(mentor) {
  return [
    mentor.name,
    mentor.university,
    mentor.studyProgram,
    mentor.studyYear,
    mentor.bio,
    mentor.facts.join(" "),
    mentor.helpWith.join(" "),
    mentor.tags.join(" ")
  ].join(" ");
}

function setupFilters() {
  const programs = [...new Set(directoryState.mentors.map((mentor) => mentor.studyProgram))].sort((a, b) =>
    a.localeCompare(b, "lt")
  );
  const universities = [...new Set(directoryState.mentors.map((mentor) => mentor.university))].sort((a, b) =>
    a.localeCompare(b, "lt")
  );

  fillSelect(programFilter, programs, "Visos kryptys", directoryState.program);
  fillSelect(universityFilter, universities, "Visi universitetai", directoryState.university);
  searchInput.value = directoryState.query;
}

function getFilteredMentors() {
  const query = normalizeText(directoryState.query.trim());

  return directoryState.mentors
    .filter((mentor) => {
      const matchesQuery = !query || normalizeText(getSearchableText(mentor)).includes(query);
      const matchesProgram = !directoryState.program || mentor.studyProgram === directoryState.program;
      const matchesUniversity =
        !directoryState.university || mentor.university === directoryState.university;

      return matchesQuery && matchesProgram && matchesUniversity;
    })
    .sort((left, right) => {
      if (right.rating !== left.rating) {
        return right.rating - left.rating;
      }

      return left.name.localeCompare(right.name, "lt");
    });
}

function getResultCopy(count) {
  if (count === 1) {
    return "Matomas 1 profilis";
  }

  return `Matomi ${count} profiliai`;
}

function renderStars(rating) {
  const filledStars = Math.round(rating);
  return "★★★★★".slice(0, filledStars) + "☆☆☆☆☆".slice(0, 5 - filledStars);
}

function renderMentors() {
  const filteredMentors = getFilteredMentors();

  resultsCopy.textContent = getResultCopy(filteredMentors.length);
  mentorGrid.hidden = filteredMentors.length === 0;
  emptyState.hidden = filteredMentors.length !== 0;

  mentorGrid.innerHTML = filteredMentors
    .map((mentor) => {
      const factsMarkup = mentor.facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("");
      const tagsMarkup = mentor.tags
        .map((tag) => `<span class="mentor-card-tag">${escapeHtml(tag)}</span>`)
        .join("");
      const hasAvailability = getVisibleSlots(mentor).length > 0;

      return `
        <article class="mentor-directory-card">
          <div class="mentor-card-layout">
            <div class="mentor-card-photo-wrap">
              <img
                class="mentor-card-photo"
                src="${escapeHtml(mentor.photo)}"
                alt="${escapeHtml(mentor.name)} portretas"
              />
            </div>

            <div class="mentor-card-body">
              <div class="mentor-card-top">
                <div>
                  <h2 class="mentor-card-name">${escapeHtml(mentor.name)}</h2>
                  <p class="mentor-card-study">
                    ${escapeHtml(mentor.university)} ${escapeHtml(mentor.studyProgram)}
                  </p>
                </div>

                <div
                  class="mentor-card-rating"
                  aria-label="Įvertinimas ${escapeHtml(mentor.rating)} iš 5"
                >
                  <span class="mentor-stars" aria-hidden="true">${renderStars(mentor.rating)}</span>
                  <span class="mentor-rating-value">
                    ${escapeHtml(mentor.rating.toFixed(1))}/5 · ${escapeHtml(mentor.reviewCount)}
                  </span>
                </div>
              </div>

              <div class="mentor-card-meta-row">
                <p class="mentor-card-year">${escapeHtml(mentor.studyYear)}</p>
                <p class="mentor-card-session">
                  ${escapeHtml(mentor.duration)} min · ${escapeHtml(formatPrice(mentor.price))}
                </p>
              </div>

              <ul class="mentor-card-facts">
                ${factsMarkup}
              </ul>

              <div class="mentor-card-bottom">
                <div class="mentor-card-tags">
                  ${tagsMarkup}
                </div>

                <button
                  class="button button-primary mentor-card-button"
                  type="button"
                  data-book-mentor="${escapeHtml(mentor.id)}"
                  ${hasAvailability ? "" : "disabled"}
                >
                  ${hasAvailability ? "Rezervuoti laiką" : "Šiuo metu vietų nėra"}
                </button>
              </div>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function getMentorById(mentorId) {
  return directoryState.mentors.find((mentor) => mentor.id === mentorId) || null;
}

function getSlotsGroupedByDate(mentor) {
  const grouped = new Map();

  getVisibleSlots(mentor).forEach((slot) => {
    if (!grouped.has(slot.date)) {
      grouped.set(slot.date, []);
    }

    grouped.get(slot.date).push(slot);
  });

  return [...grouped.entries()].map(([date, slots]) => ({
    date,
    slots
  }));
}

function closeBookingModal() {
  bookingModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function openBookingModal(mentorId) {
  const mentor = getMentorById(mentorId);

  if (!mentor) {
    return;
  }

  const groupedSlots = getSlotsGroupedByDate(mentor);
  const firstGroup = groupedSlots[0] || null;
  const firstSlot = firstGroup && firstGroup.slots ? firstGroup.slots[0] || null : null;

  bookingState.activeMentorId = mentorId;
  bookingState.activeDate = firstGroup ? firstGroup.date : "";
  bookingState.activeSlotId = firstSlot ? firstSlot.id : "";
  bookingState.studentName = "";
  bookingState.studentEmail = "";
  bookingState.submitting = false;

  renderBookingModal();
  bookingModal.hidden = false;
  document.body.classList.add("modal-open");
}

function renderBookingModal() {
  const mentor = getMentorById(bookingState.activeMentorId);

  if (!mentor) {
    closeBookingModal();
    return;
  }

  const groupedSlots = getSlotsGroupedByDate(mentor);
  const activeDateExists = groupedSlots.some((group) => group.date === bookingState.activeDate);

  if (!activeDateExists) {
    bookingState.activeDate = groupedSlots.length > 0 ? groupedSlots[0].date : "";
  }

  const activeGroup = groupedSlots.find((group) => group.date === bookingState.activeDate);
  const activeSlots = activeGroup ? activeGroup.slots : [];
  const activeSlotExists = activeSlots.some((slot) => slot.id === bookingState.activeSlotId);

  if (!activeSlotExists) {
    bookingState.activeSlotId = activeSlots.length > 0 ? activeSlots[0].id : "";
  }

  const selectedSlot = activeSlots.find((slot) => slot.id === bookingState.activeSlotId) || null;
  const dateButtons = groupedSlots
    .map((group) => {
      const isActive = group.date === bookingState.activeDate ? " is-active" : "";

      return `
        <button
          class="booking-date-chip${isActive}"
          type="button"
          data-booking-date="${escapeHtml(group.date)}"
        >
          <span>${escapeHtml(formatShortDate(group.date))}</span>
          <strong>${escapeHtml(group.slots.length)} laikai</strong>
        </button>
      `;
    })
    .join("");

  const slotButtons = activeSlots
    .map((slot) => {
      const isSelected = slot.id === bookingState.activeSlotId ? " is-selected" : "";

      return `
        <button
          class="booking-slot-button${isSelected}"
          type="button"
          data-booking-slot="${escapeHtml(slot.id)}"
        >
          ${escapeHtml(slot.time)}
        </button>
      `;
    })
    .join("");

  const helpMarkup = mentor.helpWith.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const submitDisabled = !selectedSlot || bookingState.submitting || !directoryState.apiAvailable;

  bookingModalContent.innerHTML = `
    <div class="booking-modal-header">
      <div class="booking-modal-profile">
        <div class="booking-modal-photo-wrap">
          <img
            class="booking-modal-photo"
            src="${escapeHtml(mentor.photo)}"
            alt="${escapeHtml(mentor.name)} portretas"
          />
        </div>

        <div class="booking-modal-profile-copy">
          <p class="eyebrow">Rezervacija</p>
          <h2 id="booking-modal-title">${escapeHtml(mentor.name)}, ${escapeHtml(mentor.university)} ${escapeHtml(mentor.studyProgram)}</h2>
          <p>${escapeHtml(mentor.bio)}</p>

          <div class="booking-modal-badges">
            <span>${escapeHtml(mentor.studyYear)}</span>
            <span>${escapeHtml(mentor.duration)} min</span>
            <span>${escapeHtml(formatPrice(mentor.price))}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="booking-modal-grid">
      <section class="booking-modal-panel">
        <p class="booking-panel-label">Mentorius gali padėti su</p>
        <ul class="booking-help-list">
          ${helpMarkup}
        </ul>
      </section>

      <section class="booking-modal-panel">
        <p class="booking-panel-label">Pasirink datą</p>
        <div class="booking-date-grid">
          ${dateButtons || '<p class="booking-empty-copy">Šiuo metu naujų laikų nėra.</p>'}
        </div>

        <p class="booking-panel-label booking-panel-label-spaced">Pasirink laiką</p>
        <div class="booking-slot-grid">
          ${slotButtons || '<p class="booking-empty-copy">Pasirinkus kitą datą čia matysi galimus laikus.</p>'}
        </div>
      </section>
    </div>

    <form class="booking-form" id="booking-form">
      <div class="booking-form-grid">
        <label class="booking-form-field">
          <span>Vardas</span>
          <input
            id="booking-student-name"
            name="studentName"
            type="text"
            autocomplete="name"
            placeholder="Tavo vardas"
            value="${escapeHtml(bookingState.studentName)}"
            required
          />
        </label>

        <label class="booking-form-field">
          <span>El. paštas</span>
          <input
            id="booking-student-email"
            name="studentEmail"
            type="email"
            autocomplete="email"
            placeholder="tavo@pastas.lt"
            value="${escapeHtml(bookingState.studentEmail)}"
            required
          />
        </label>
      </div>

      <div class="booking-form-footer">
        <p class="booking-selection-copy">
          ${
            selectedSlot
              ? `Rezervuosi ${escapeHtml(formatLongDate(selectedSlot.date))} ${escapeHtml(selectedSlot.time)} laiką.`
              : "Pasirink datą ir laiką, kad galėtum tęsti apmokėjimą."
          }
        </p>

        ${
          directoryState.apiAvailable
            ? '<p class="booking-payment-note">Po sėkmingo Stripe apmokėjimo laikas bus automatiškai rezervuotas ir dings iš sąrašo.</p>'
            : '<p class="booking-payment-note is-warning">Rodomas demonstracinis rezervavimo vaizdas. Tikras apmokėjimas veiks paleidus API ir Stripe raktus.</p>'
        }

        <button class="button button-primary booking-submit-button" type="submit" ${submitDisabled ? "disabled" : ""}>
          ${bookingState.submitting ? "Jungiama prie apmokėjimo..." : "Tęsti į apmokėjimą"}
        </button>
      </div>
    </form>
  `;
}

async function beginCheckout() {
  const mentor = getMentorById(bookingState.activeMentorId);

  if (!mentor || !bookingState.activeSlotId) {
    setStatus("Pirmiausia pasirink datą ir laiką.", "warning");
    return;
  }

  if (!directoryState.apiAvailable) {
    setStatus(
      "Demo režime galima peržiūrėti rezervacijos eigą, bet pilnas Stripe apmokėjimas veiks tik su API ir Stripe raktais.",
      "warning"
    );
    return;
  }

  const payload = {
    mentorId: mentor.id,
    slotId: bookingState.activeSlotId,
    studentName: bookingState.studentName.trim(),
    studentEmail: bookingState.studentEmail.trim()
  };

  if (!payload.studentName || !payload.studentEmail) {
    setStatus("Įrašyk vardą ir el. paštą prieš tęsiant.", "warning");
    return;
  }

  bookingState.submitting = true;
  renderBookingModal();

  try {
    const response = await fetch("./api/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.checkoutUrl) {
      throw new Error(result.error || "Nepavyko pradėti apmokėjimo.");
    }

    window.location.href = result.checkoutUrl;
  } catch (error) {
    bookingState.submitting = false;
    renderBookingModal();
    setStatus(error.message || "Nepavyko pradėti apmokėjimo.", "error");
  }
}

async function loadMentorsFromApi() {
  const response = await fetch("./api/mentors", {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error("Mentorių API nepasiekiama.");
  }

  const result = await response.json();

  if (!Array.isArray(result.mentors)) {
    throw new Error("Netinkamas mentorių atsakas.");
  }

  return result.mentors;
}

async function init() {
  readDirectoryStateFromUrl();
  setStatus("Krauname rezervacijos laikus...", "info");

  try {
    directoryState.mentors = await loadFallbackMentors();
    setupFilters();
    renderMentors();

    const mentors = await loadMentorsFromApi();

    directoryState.mentors = mentors;
    directoryState.apiAvailable = true;
    setupFilters();
    renderMentors();
    setStatus("");
  } catch (error) {
    directoryState.apiAvailable = false;
    setupFilters();
    renderMentors();
    setStatus(
      "Rodomas demonstracinis rezervacijos vaizdas. Pilnas Stripe apmokėjimas veiks paleidus API ir Stripe raktus.",
      "warning"
    );
  }
}

function updateFilterState(key, value) {
  directoryState[key] = value;
  writeDirectoryStateToUrl();
  renderMentors();
}

function resetFilters() {
  directoryState.query = "";
  directoryState.program = "";
  directoryState.university = "";

  setupFilters();
  writeDirectoryStateToUrl();
  renderMentors();
}

mentorGrid.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-book-mentor]");

  if (!trigger) {
    return;
  }

  openBookingModal(trigger.getAttribute("data-book-mentor"));
});

bookingModalContent.addEventListener("click", (event) => {
  const dateTrigger = event.target.closest("[data-booking-date]");

  if (dateTrigger) {
    bookingState.activeDate = dateTrigger.getAttribute("data-booking-date");
    bookingState.activeSlotId = "";
    renderBookingModal();
    return;
  }

  const slotTrigger = event.target.closest("[data-booking-slot]");

  if (slotTrigger) {
    bookingState.activeSlotId = slotTrigger.getAttribute("data-booking-slot");
    renderBookingModal();
  }
});

bookingModalContent.addEventListener("input", (event) => {
  if (event.target.id === "booking-student-name") {
    bookingState.studentName = event.target.value;
  }

  if (event.target.id === "booking-student-email") {
    bookingState.studentEmail = event.target.value;
  }
});

bookingModalContent.addEventListener("submit", async (event) => {
  if (event.target.id !== "booking-form") {
    return;
  }

  event.preventDefault();
  await beginCheckout();
});

bookingModalClose.addEventListener("click", closeBookingModal);
bookingModalBackdrop.addEventListener("click", closeBookingModal);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !bookingModal.hidden) {
    closeBookingModal();
  }
});

searchInput.addEventListener("input", (event) => {
  updateFilterState("query", event.target.value);
});

programFilter.addEventListener("change", (event) => {
  updateFilterState("program", event.target.value);
});

universityFilter.addEventListener("change", (event) => {
  updateFilterState("university", event.target.value);
});

resetFiltersButton.addEventListener("click", resetFilters);

init();
