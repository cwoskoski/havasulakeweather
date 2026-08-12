/**
 * Havasu Lake Weather — ingest Lambda (Phase 1: logger)
 *
 * Behind CloudFront (which accepts the console's plaintext HTTP on port 80 and
 * forwards over HTTPS via a Lambda Function URL). This first version just LOGS
 * whatever the console sends to CloudWatch, so we can read one real payload,
 * finalize the DynamoDB schema, and confirm the Ambient field names. Storage +
 * dedupe come next.
 *
 * Event shape: Lambda Function URL, payload format 2.0.
 */

export const handler = async (event) => {
  const now = new Date().toISOString();
  const method = event?.requestContext?.http?.method ?? "?";
  const path = event?.rawPath ?? "/";
  const rawQuery = event?.rawQueryString ?? "";
  const query = event?.queryStringParameters ?? {};
  const sourceIp = event?.requestContext?.http?.sourceIp;
  const body = event?.body ?? "";

  console.log(
    JSON.stringify({
      msg: "ingest-request",
      receivedAt: now,
      method,
      path,
      sourceIp,
      rawQuery,
      fieldCount: Object.keys(query).length,
      query,
      body: body || undefined,
    })
  );

  // Both the Ambient and Wunderground protocols accept a 200; Wunderground's
  // updateweatherstation endpoint specifically expects the body "success".
  return {
    statusCode: 200,
    headers: { "content-type": "text/plain" },
    body: "success\n",
  };
};
