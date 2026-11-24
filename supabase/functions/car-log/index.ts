import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { carEventOf, carStep, type CarTrip } from '../_shared/car.ts';

/**
 * Called by the phone when it connects to the car and when it leaves it:
 *   …/car-log?event=connect&token=…      …/car-log?event=disconnect&token=…
 * The link is the whole request (GET), so an iPhone Shortcuts automation only needs it
 * pasted in. A POST with { token, event } as JSON works too.
 */
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const query = new URL(req.url).searchParams;
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const token = String(body?.token ?? query.get('token') ?? '').trim();
    const event = carEventOf(body?.event ?? query.get('event'));

    if (!token) return errorResponse('Missing token', 401);
    if (!event) return errorResponse('Unknown event', 400);

    const admin = getServiceClient();
    const { data: link, error: linkError } = await admin
      .from('car_links')
      .select('user_id')
      .eq('token', token)
      .maybeSingle();
    if (linkError) throw linkError;
    if (!link?.user_id) return errorResponse('Invalid token', 401);

    const { data: trips, error: tripsError } = await admin
      .from('car_trips')
      .select('id, started_at, ended_at, imported_at')
      .eq('user_id', link.user_id)
      .order('started_at', { ascending: false })
      .limit(1);
    if (tripsError) throw tripsError;

    const now = new Date();
    let step = carStep((trips?.[0] as CarTrip | undefined) ?? null, event, now.getTime());

    if (step.do === 'reopen') {
      const { data: reopened, error } = await admin
        .from('car_trips')
        .update({ ended_at: null })
        .eq('id', step.id)
        .is('imported_at', null)
        .select('id');
      if (error) throw error;
      // An app took the trip into the Path in the meantime: this is a new drive.
      if (!reopened?.length) step = { do: 'open' };
    }

    if (step.do === 'open') {
      if (step.drop) {
        const { error } = await admin.from('car_trips').delete().eq('id', step.drop);
        if (error) throw error;
      }
      const { error } = await admin
        .from('car_trips')
        .insert({ user_id: link.user_id, started_at: now.toISOString() });
      if (error) throw error;
    } else if (step.do === 'close') {
      const { error } = await admin
        .from('car_trips')
        .update({ ended_at: now.toISOString() })
        .eq('id', step.id);
      if (error) throw error;
    } else if (step.do === 'drop') {
      const { error } = await admin.from('car_trips').delete().eq('id', step.id);
      if (error) throw error;
    }

    return jsonResponse({ ok: true, event, trip: step.do });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Car log failed';
    return errorResponse(message, 500);
  }
});
