# ingest

Lambda source (Node.js 24) that receives the weather console's HTTP posts and
stores them. Deployed via the SAM stack (`../template.yaml`) behind CloudFront,
which accepts the console's plaintext HTTP on port 80 and forwards to the Lambda
over HTTPS.

## Status: step 1 — logger

The first deploy is a **logger** Lambda that dumps whatever the console sends to
CloudWatch, so we can read one real payload, finalize the schema, and settle the
Ambient-vs-Wunderground format question with actual data. Storage (DynamoDB) +
dedupe come next.

`src/handler.js` is the Lambda entry point (Function URL event → log → HTTP 200).

## Console upload settings (Ambient "Customized")

- Protocol: **Ambient Weather**
- Server: the CloudFront distribution domain (`*.cloudfront.net`)
- Port: **80**
- Path: the ingest path (set in Phase 1)

## Local test

    sam local invoke IngestFunction -e events/console-get.json --profile havasu
