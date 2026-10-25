import { bodyLimit } from "hono/body-limit";

/**
 * Cap request bodies before any route parses them. Without a cap, Node buffers
 * whatever a client sends, and JSON parsing plus validation multiply that in
 * memory. The largest real request is a section update with every answer at
 * its 10,000-character limit: about 810 KB for 27 answers of CJK text. 2 MB
 * leaves room for that.
 */
export const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024;

export const requestBodyLimit = bodyLimit({
  maxSize: MAX_REQUEST_BODY_BYTES,
  onError: (c) =>
    c.json(
      { error: "payload_too_large", message: `Request body must be at most ${MAX_REQUEST_BODY_BYTES / 1024 / 1024} MB` },
      413,
    ),
});
