const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const dataDirectory = path.join(process.cwd(), "data");
const fileStorePath = path.join(dataDirectory, "runtime-store.json");
const fileLockPath = path.join(dataDirectory, "runtime-store.lock");

const redisUrl =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  "";
const redisToken =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  "";
const redisStateKey = process.env.BOOKING_STATE_KEY || "alumnas:booking-state:v1";
const redisLockKey = `${redisStateKey}:lock`;

function hasSharedStore() {
  return Boolean(redisUrl && redisToken);
}

async function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function redisCommand(command) {
  const response = await fetch(redisUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.error) {
    throw new Error(payload.error || "Nepavyko pasiekti rezervacijų saugyklos.");
  }

  return payload.result;
}

async function ensureFileStore(createInitialState) {
  await fs.mkdir(dataDirectory, {
    recursive: true
  });

  try {
    await fs.access(fileStorePath);
  } catch (error) {
    await fs.writeFile(fileStorePath, JSON.stringify(createInitialState(), null, 2), "utf8");
  }
}

async function readFileState(createInitialState) {
  await ensureFileStore(createInitialState);
  const rawState = await fs.readFile(fileStorePath, "utf8");
  return JSON.parse(rawState);
}

async function writeFileState(state) {
  await fs.writeFile(fileStorePath, JSON.stringify(state, null, 2), "utf8");
}

async function withFileLock(task) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const handle = await fs.open(fileLockPath, "wx");

      try {
        return await task();
      } finally {
        await handle.close().catch(() => {});
        await fs.unlink(fileLockPath).catch(() => {});
      }
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }

      await wait(75);
    }
  }

  throw new Error("Nepavyko užrakinti rezervacijų saugyklos.");
}

async function ensureRedisState(createInitialState) {
  const existing = await redisCommand(["GET", redisStateKey]);

  if (existing) {
    return;
  }

  await redisCommand(["SET", redisStateKey, JSON.stringify(createInitialState())]);
}

async function readRedisState(createInitialState) {
  await ensureRedisState(createInitialState);
  const rawState = await redisCommand(["GET", redisStateKey]);
  return JSON.parse(rawState);
}

async function writeRedisState(state) {
  await redisCommand(["SET", redisStateKey, JSON.stringify(state)]);
}

async function withRedisLock(task) {
  const token = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : crypto.randomBytes(12).toString("hex");

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const lockResult = await redisCommand(["SET", redisLockKey, token, "NX", "PX", 10000]);

    if (lockResult === "OK") {
      try {
        return await task();
      } finally {
        // Atlaisviname lock tik jei jis vis dar priklauso siam vykdymui.
        await redisCommand([
          "EVAL",
          "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
          "1",
          redisLockKey,
          token
        ]).catch(() => {});
      }
    }

    await wait(75);
  }

  throw new Error("Nepavyko užrakinti rezervacijų saugyklos.");
}

async function readState(createInitialState) {
  if (hasSharedStore()) {
    return readRedisState(createInitialState);
  }

  return readFileState(createInitialState);
}

async function writeState(state) {
  if (hasSharedStore()) {
    return writeRedisState(state);
  }

  return writeFileState(state);
}

async function withStateLock(task) {
  if (hasSharedStore()) {
    return withRedisLock(task);
  }

  return withFileLock(task);
}

module.exports = {
  hasSharedStore,
  readState,
  withStateLock,
  writeState
};
