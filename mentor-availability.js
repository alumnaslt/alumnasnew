(function () {
  const isMentorPage = document.body.classList.contains("mentor-availability-page");
  const isAdminPage = document.body.classList.contains("mentor-admin-page");

  function getQueryParam(key) {
    const url = new URL(window.location.href);
    return url.searchParams.get(key);
  }

  function formatDateLabel(dateString) {
    return new Intl.DateTimeFormat("lt-LT", {
      weekday: "long",
      month: "long",
      day: "numeric"
    }).format(new Date(`${dateString}T12:00:00`));
  }

  function createSlotKey(slot) {
    return `${slot.date}__${slot.time}`;
  }

  async function loadMentorPage() {
    const mentorId = getQueryParam("mentor");
    const title = document.getElementById("availability-title");
    const subtitle = document.getElementById("availability-subtitle");
    const periodSwitch = document.getElementById("period-switch");
    const grid = document.getElementById("availability-grid");
    const pickedSlots = document.getElementById("picked-slots");
    const status = document.getElementById("availability-status");
    const notes = document.getElementById("availability-notes");
    const clearButton = document.getElementById("clear-selected");
    const saveButton = document.getElementById("save-availability");

    if (!mentorId) {
      title.textContent = "Trūksta mentoriaus nuorodos";
      subtitle.textContent = "Pridėk `?mentor=...` prie nuorodos ir bandyk dar kartą.";
      return;
    }

    let activePeriod = "week";
    let selected = new Map();

    function renderPickedSlots() {
      pickedSlots.innerHTML = "";
      const items = [...selected.values()].sort((left, right) => {
        const leftKey = `${left.date} ${left.time}`;
        const rightKey = `${right.date} ${right.time}`;
        return leftKey.localeCompare(rightKey, "lt");
      });

      if (!items.length) {
        const empty = document.createElement("span");
        empty.textContent = "Kol kas nieko nepažymėta";
        pickedSlots.appendChild(empty);
        return;
      }

      items.forEach((item) => {
        const chip = document.createElement("span");
        chip.textContent = `${formatDateLabel(item.date)} ${item.time}`;
        pickedSlots.appendChild(chip);
      });
    }

    function setStatus(message, type) {
      status.textContent = message || "";
      status.dataset.type = type || "";
    }

    async function fetchConfig(period) {
      const response = await fetch(`/api/mentor-availability-config?mentor=${encodeURIComponent(mentorId)}&period=${period}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Nepavyko užkrauti formos.");
      }

      return payload;
    }

    function renderGrid(config) {
      title.textContent = `${config.mentor.name}, pažymėk savo laisvus laikus`;
      subtitle.textContent = `${config.mentor.studyProgram}, ${config.mentor.university}. Informacija bus matoma tik ALUMNAS admin suvestinėje.`;
      grid.innerHTML = "";

      config.dates.forEach((day) => {
        const card = document.createElement("article");
        card.className = "mentor-day-card";

        const header = document.createElement("div");
        header.className = "mentor-day-card-header";
        header.innerHTML = `<strong>${formatDateLabel(day.date)}</strong><span>${day.shortLabel}</span>`;

        const slots = document.createElement("div");
        slots.className = "mentor-day-slots";

        day.times.forEach((time) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "mentor-slot-button";
          button.textContent = time;
          button.dataset.date = day.date;
          button.dataset.time = time;

          const key = createSlotKey({
            date: day.date,
            time
          });

          if (selected.has(key)) {
            button.classList.add("is-selected");
          }

          button.addEventListener("click", () => {
            if (selected.has(key)) {
              selected.delete(key);
              button.classList.remove("is-selected");
            } else {
              selected.set(key, {
                date: day.date,
                time
              });
              button.classList.add("is-selected");
            }

            renderPickedSlots();
          });

          slots.appendChild(button);
        });

        card.appendChild(header);
        card.appendChild(slots);
        grid.appendChild(card);
      });
    }

    async function refresh(period) {
      setStatus("Kraunama...", "neutral");
      const config = await fetchConfig(period);
      activePeriod = period;
      renderGrid(config);
      renderPickedSlots();
      setStatus("", "");

      if (config.latestSubmission && !selected.size) {
        notes.value = config.latestSubmission.notes || "";
      }
    }

    periodSwitch.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-period]");

      if (!button) {
        return;
      }

      [...periodSwitch.querySelectorAll("button")].forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      refresh(button.dataset.period).catch((error) => {
        setStatus(error.message, "error");
      });
    });

    clearButton.addEventListener("click", () => {
      selected = new Map();
      renderPickedSlots();
      [...grid.querySelectorAll(".mentor-slot-button")].forEach((button) => button.classList.remove("is-selected"));
    });

    saveButton.addEventListener("click", async () => {
      setStatus("Saugoma...", "neutral");

      try {
        const response = await fetch("/api/mentor-availability-submit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            mentorId,
            period: activePeriod,
            notes: notes.value,
            selectedSlots: [...selected.values()]
          })
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Nepavyko išsaugoti laikų.");
        }

        setStatus("Laikai išsaugoti. Tuoj matysi juos admin suvestinėje.", "success");
      } catch (error) {
        setStatus(error.message, "error");
      }
    });

    refresh(activePeriod).catch((error) => {
      setStatus(error.message, "error");
    });
  }

  async function loadAdminPage() {
    const list = document.getElementById("mentor-admin-list");

    const response = await fetch("/api/admin-mentor-availability");
    const payload = await response.json();

    if (!response.ok) {
      list.innerHTML = `<div class="mentor-admin-card"><p>${payload.error || "Nepavyko užkrauti suvestinės."}</p></div>`;
      return;
    }

    list.innerHTML = "";

    payload.items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "mentor-admin-card";

      const latest = item.latestSubmission;
      const slotMarkup = latest && latest.selectedSlots.length
        ? latest.selectedSlots
            .map((slot) => `<span>${formatDateLabel(slot.date)} ${slot.time}</span>`)
            .join("")
        : "<span>Kol kas dar nieko nepateikta</span>";

      card.innerHTML = `
        <div class="mentor-admin-card-header">
          <div>
            <h2>${item.mentor.name}</h2>
            <p>${item.mentor.studyProgram}, ${item.mentor.university}</p>
          </div>
          <div class="mentor-admin-count">${item.submissionCount} pateikimai</div>
        </div>
        <div class="mentor-admin-meta">
          <strong>Paskutinis pateikimas:</strong>
          <span>${latest ? new Date(latest.submittedAt).toLocaleString("lt-LT") : "Nėra"}</span>
        </div>
        <div class="mentor-admin-slots">${slotMarkup}</div>
        <div class="mentor-admin-notes">
          <strong>Pastabos:</strong>
          <p>${latest && latest.notes ? latest.notes : "Pastabų nėra."}</p>
        </div>
      `;

      list.appendChild(card);
    });
  }

  if (isMentorPage) {
    loadMentorPage();
  }

  if (isAdminPage) {
    loadAdminPage();
  }
})();
