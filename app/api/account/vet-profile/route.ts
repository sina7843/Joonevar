import { NextResponse } from 'next/server';
import { db } from '../../../../src/db/client.ts';
import { currentActor } from '../../../../src/authz/request-actor.ts';
import { requireActor } from '../../../../src/authz/actor.ts';
import { toErrorBody } from '../../../../src/domain/errors.ts';
import { professionalDashboard } from '../../../../src/vets/professional-profile.ts';

export const dynamic = 'force-dynamic';

/**
 * The signed-in account's own professional profile, as JSON for a mobile client
 * (Phase 2.5 PROMPT-003). It answers only about the caller: there is no id in
 * the address, so no other account can be asked for.
 */
export async function GET() {
  try {
    const actor = requireActor(await currentActor(db()));
    return NextResponse.json(await professionalDashboard(db(), actor), {
      headers: { 'cache-control': 'no-store, private' },
    });
  } catch (error) {
    const { status, body } = toErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
