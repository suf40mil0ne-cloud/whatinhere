export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}

export function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

export function unauthorized(message = "Unauthorized"): Response {
  return json({ error: message }, 401);
}

export function serverError(message = "Internal server error"): Response {
  return json({ error: message }, 500);
}
