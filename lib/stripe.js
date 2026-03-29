const crypto = require("crypto");

async function stripeRequest({ method, path, secretKey, params }) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(params
        ? {
            "Content-Type": "application/x-www-form-urlencoded"
          }
        : {})
    },
    ...(params
      ? {
          body: params.toString()
        }
      : {})
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage = payload && payload.error ? payload.error.message : null;
    throw new Error(errorMessage || "Stripe užklausa nepavyko.");
  }

  return payload;
}

async function createCheckoutSession({ secretKey, params }) {
  return stripeRequest({
    method: "POST",
    path: "/v1/checkout/sessions",
    secretKey,
    params
  });
}

async function getCheckoutSession({ secretKey, sessionId }) {
  return stripeRequest({
    method: "GET",
    path: `/v1/checkout/sessions/${sessionId}`,
    secretKey
  });
}

function verifyStripeSignature({ rawBody, signatureHeader, webhookSecret }) {
  if (!signatureHeader || !webhookSecret) {
    return false;
  }

  const signatureParts = String(signatureHeader).split(",");
  const timestampPart = signatureParts.find((part) => part.startsWith("t="));
  const v1Part = signatureParts.find((part) => part.startsWith("v1="));
  const timestamp = timestampPart ? timestampPart.slice(2) : null;
  const v1Signature = v1Part ? v1Part.slice(3) : null;

  if (!timestamp || !v1Signature) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload, "utf8")
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const receivedBuffer = Buffer.from(v1Signature, "utf8");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

module.exports = {
  createCheckoutSession,
  getCheckoutSession,
  verifyStripeSignature
};
