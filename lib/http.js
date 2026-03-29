const { URL } = require("url");

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function methodNotAllowed(res, allowedMethods) {
  res.setHeader("Allow", allowedMethods.join(", "));
  sendJson(res, 405, {
    error: "Metodas neleidžiamas."
  });
}

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let rawBody = "";

    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      rawBody += chunk;
    });
    req.on("end", () => resolve(rawBody));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const rawBody = await readRawBody(req);

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch (error) {
    const parsingError = new Error("Neteisingas JSON formatas.");
    parsingError.statusCode = 400;
    throw parsingError;
  }
}

function getBaseUrl(req) {
  const forwardedProtoHeader = req.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwardedProtoHeader)
    ? forwardedProtoHeader[0]
    : forwardedProtoHeader;
  const forwardedHostHeader = req.headers["x-forwarded-host"];
  const host = Array.isArray(forwardedHostHeader)
    ? forwardedHostHeader[0]
    : forwardedHostHeader || req.headers.host;
  const protocol = forwardedProto || (String(host).includes("localhost") ? "http" : "https");

  return `${protocol}://${host}`;
}

function getQueryParam(req, key) {
  const url = new URL(req.url, getBaseUrl(req));
  return url.searchParams.get(key);
}

module.exports = {
  getBaseUrl,
  getQueryParam,
  methodNotAllowed,
  readJsonBody,
  readRawBody,
  sendJson
};
