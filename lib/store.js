const crypto = require("crypto");
const { createSeedSlots, findMentor, mentors } = require("./mentors-data");
const { readState, withStateLock, writeState } = require("./state-store");
const holdDurationMs = 35 * 60 * 1000;

function createId(prefix) {
  if (typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function createInitialState() {
  return {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    bookings: [],
    slots: createSeedSlots()
  };
}

function syncSlotsWithSeedData(state) {
  const seedSlots = createSeedSlots();
  const existingSlotsById = new Map(state.slots.map((slot) => [slot.id, slot]));
  const activeBookingSlotIds = new Set(
    state.bookings
      .filter((booking) => booking.paymentStatus === "paid" || booking.paymentStatus === "pending")
      .map((booking) => booking.slotId)
  );

  const nextSlots = seedSlots.map((seedSlot) => existingSlotsById.get(seedSlot.id) || seedSlot);

  state.slots.forEach((slot) => {
    const existsInSeed = seedSlots.some((seedSlot) => seedSlot.id === slot.id);

    if (existsInSeed) {
      return;
    }

    if (slot.isBooked || slot.holdBookingId || activeBookingSlotIds.has(slot.id)) {
      nextSlots.push(slot);
    }
  });

  const changed =
    nextSlots.length !== state.slots.length ||
    nextSlots.some((slot, index) => state.slots[index] !== slot);

  if (changed) {
    state.slots = nextSlots;
  }

  return changed;
}

async function readStateFile() {
  const state = await readState(createInitialState);

  if (syncSlotsWithSeedData(state)) {
    await writeStateFile(state);
  }

  return state;
}

async function writeStateFile(state) {
  state.updatedAt = new Date().toISOString();
  await writeState(state);
}

function releaseExpiredHoldsInState(state) {
  const now = Date.now();
  let changed = false;

  state.slots.forEach((slot) => {
    if (slot.isBooked || !slot.holdBookingId || !slot.holdUntil) {
      return;
    }

    if (new Date(slot.holdUntil).getTime() > now) {
      return;
    }

    const booking = state.bookings.find((item) => item.id === slot.holdBookingId);

    if (booking && booking.paymentStatus === "pending") {
      booking.paymentStatus = "expired";
      booking.expiredAt = new Date().toISOString();
    }

    slot.holdBookingId = null;
    slot.holdUntil = null;
    changed = true;
  });

  return changed;
}

function sortSlots(left, right) {
  return `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`, "lt");
}

function buildMentorsWithAvailability(state) {
  return mentors.map((mentor) => {
    const slots = state.slots
      .filter((slot) => {
        return (
          slot.mentorId === mentor.id &&
          !slot.isBooked &&
          !slot.holdBookingId
        );
      })
      .sort(sortSlots)
      .map((slot) => ({
        id: slot.id,
        mentorId: slot.mentorId,
        date: slot.date,
        time: slot.time,
        isBooked: false
      }));

    return {
      ...mentor,
      slots
    };
  });
}

async function getMentorsWithAvailability() {
  return withStateLock(async () => {
    const state = await readStateFile();
    const changed = releaseExpiredHoldsInState(state);

    if (changed) {
      await writeStateFile(state);
    }

    return buildMentorsWithAvailability(state);
  });
}

async function reserveSlotForCheckout({ mentorId, slotId, studentName, studentEmail }) {
  return withStateLock(async () => {
    const state = await readStateFile();
    const changed = releaseExpiredHoldsInState(state);
    const mentor = findMentor(mentorId);

    if (!mentor) {
      throw new Error("Mentorius nerastas.");
    }

    const slot = state.slots.find((item) => item.id === slotId && item.mentorId === mentorId);

    if (!slot) {
      throw new Error("Pasirinktas laikas nerastas.");
    }

    if (slot.isBooked || slot.holdBookingId) {
      if (changed) {
        await writeStateFile(state);
      }

      throw new Error("Šis laikas ką tik tapo nepasiekiamas. Pasirink kitą.");
    }

    const now = new Date();
    const heldUntil = new Date(now.getTime() + holdDurationMs).toISOString();
    const booking = {
      id: createId("booking"),
      mentorId,
      slotId,
      studentName,
      studentEmail,
      paymentStatus: "pending",
      stripeSessionId: null,
      paymentIntentId: null,
      adminEmailSentAt: null,
      studentEmailSentAt: null,
      createdAt: now.toISOString(),
      heldUntil
    };

    // Laikas trumpam uzlaikomas checkout metu, bet dar nelaikomas nupirktu.
    // Galutinis rezervavimas ivyks tik po sekmingo Stripe apmokejimo.
    slot.holdBookingId = booking.id;
    slot.holdUntil = heldUntil;
    state.bookings.push(booking);

    await writeStateFile(state);

    return {
      booking,
      mentor,
      slot: {
        id: slot.id,
        mentorId: slot.mentorId,
        date: slot.date,
        time: slot.time
      }
    };
  });
}

async function attachStripeSession({ bookingId, sessionId }) {
  return withStateLock(async () => {
    const state = await readStateFile();
    const booking = state.bookings.find((item) => item.id === bookingId);

    if (!booking) {
      throw new Error("Rezervacija nerasta.");
    }

    booking.stripeSessionId = sessionId;
    await writeStateFile(state);

    return booking;
  });
}

async function releaseBookingHold({ bookingId, sessionId }) {
  return withStateLock(async () => {
    const state = await readStateFile();
    const changed = releaseExpiredHoldsInState(state);
    const booking = state.bookings.find((item) => {
      if (bookingId && item.id === bookingId) {
        return true;
      }

      if (sessionId && item.stripeSessionId === sessionId) {
        return true;
      }

      return false;
    });

    if (!booking) {
      if (changed) {
        await writeStateFile(state);
      }

      return null;
    }

    if (booking.paymentStatus !== "paid") {
      booking.paymentStatus = booking.paymentStatus === "expired" ? "expired" : "cancelled";
      booking.cancelledAt = new Date().toISOString();
    }

    const slot = state.slots.find((item) => item.id === booking.slotId);

    if (slot && slot.holdBookingId === booking.id && !slot.isBooked) {
      slot.holdBookingId = null;
      slot.holdUntil = null;
    }

    await writeStateFile(state);

    return booking;
  });
}

async function markBookingPaid({ sessionId, paymentIntentId }) {
  return withStateLock(async () => {
    const state = await readStateFile();
    releaseExpiredHoldsInState(state);

    const booking = state.bookings.find((item) => item.stripeSessionId === sessionId);

    if (!booking) {
      return null;
    }

    const slot = state.slots.find((item) => item.id === booking.slotId);

    if (!slot) {
      throw new Error("Rezervacijos laikas nerastas.");
    }

    const wasAlreadyPaid = booking.paymentStatus === "paid";

    // Tik po sekmingo apmokejimo laika pazymime kaip uzimta ir paslepiame is ateities pasirinkimu.
    booking.paymentStatus = "paid";
    booking.paymentIntentId = paymentIntentId || booking.paymentIntentId;
    booking.paidAt = booking.paidAt || new Date().toISOString();

    slot.isBooked = true;
    slot.bookedBookingId = booking.id;
    slot.bookedAt = booking.paidAt;
    slot.holdBookingId = null;
    slot.holdUntil = null;

    await writeStateFile(state);

    return {
      wasAlreadyPaid,
      booking,
      mentor: findMentor(booking.mentorId),
      slot: {
        id: slot.id,
        mentorId: slot.mentorId,
        date: slot.date,
        time: slot.time
      }
    };
  });
}

async function markBookingEmailsSent({ sessionId, adminEmailSentAt, studentEmailSentAt }) {
  return withStateLock(async () => {
    const state = await readStateFile();
    const booking = state.bookings.find((item) => item.stripeSessionId === sessionId);

    if (!booking) {
      return null;
    }

    if (adminEmailSentAt) {
      booking.adminEmailSentAt = adminEmailSentAt;
    }

    if (studentEmailSentAt) {
      booking.studentEmailSentAt = studentEmailSentAt;
    }

    await writeStateFile(state);

    return booking;
  });
}

async function getBookingWithRelations({ bookingId, sessionId }) {
  return withStateLock(async () => {
    const state = await readStateFile();
    const changed = releaseExpiredHoldsInState(state);
    const booking = state.bookings.find((item) => {
      if (bookingId && item.id === bookingId) {
        return true;
      }

      if (sessionId && item.stripeSessionId === sessionId) {
        return true;
      }

      return false;
    });

    if (changed) {
      await writeStateFile(state);
    }

    if (!booking) {
      return null;
    }

    const slot = state.slots.find((item) => item.id === booking.slotId);

    return {
      booking,
      mentor: findMentor(booking.mentorId),
      slot: slot
        ? {
            id: slot.id,
            mentorId: slot.mentorId,
            date: slot.date,
            time: slot.time
          }
        : null
    };
  });
}

module.exports = {
  attachStripeSession,
  getBookingWithRelations,
  getMentorsWithAvailability,
  holdDurationMs,
  markBookingEmailsSent,
  markBookingPaid,
  releaseBookingHold,
  reserveSlotForCheckout
};
