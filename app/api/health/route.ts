import { NextResponse } from 'next/server';
import { db } from '../../../src/db/client.ts';
import { healthReport } from '../../../src/health/service.ts';
import { toErrorBody } from '../../../src/domain/errors.ts';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const report = await healthReport(db());
    // A degraded report is still a truthful 200 answer; 503 is reserved for a
    // database the app cannot reach at all.
    return NextResponse.json(report, { status: report.database.reachable ? 200 : 503 });
  } catch (error) {
    const { status, body } = toErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
