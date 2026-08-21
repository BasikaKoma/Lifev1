import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { ingestScaleWeight } from '../_shared/scale.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const weightKg = typeof body.weightKg === 'number' ? body.weightKg : Number(body.weightKg);
    const recordedAt = typeof body.recordedAt === 'string' ? body.recordedAt : new Date().toISOString();
    const day = typeof body.day === 'string' ? body.day : recordedAt.slice(0, 10);

    if (!token) return errorResponse('Missing token', 401);
    if (!Number.isFinite(weightKg) || weightKg < 5 || weightKg > 300) {
      return errorResponse('Invalid weight', 400);
    }

    const result = await ingestScaleWeight({
      token,
      weightKg,
      impedance: typeof body.impedance === 'number' ? body.impedance : null,
      deviceId: typeof body.deviceId === 'string' ? body.deviceId : null,
      deviceName: typeof body.deviceName === 'string' ? body.deviceName : null,
      day,
      recordedAt,
      stable: body.stable !== false,
    });

    return jsonResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ingest failed';
    const status = message === 'Invalid ingest token' ? 401 : 500;
    return errorResponse(message, status);
  }
});
