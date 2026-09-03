/**
 * Tidies the development database after test runs.
 *
 * Every full browser run creates its own veterinarian locations with a valid
 * licence and leaves visits half-finished, so the check-in list and the queues
 * grow a little each time until they are tiring to work with by hand. This
 * retires the synthetic locations that are not the four kept for manual testing,
 * and cancels visits nobody is going to attend.
 *
 * Nothing is deleted: every sample, referral and document keeps pointing at the
 * row it always pointed at. A retired location simply stops being offered for
 * new work, which is the product's own rule (§11.1).
 *
 * Refuses to run against anything but a local development database.
 *
 *   node --env-file=.env.local tools/dev-tidy.mjs
 */
import pg from 'pg';

const KEEP = [
  'SYNTHETIC کلینیک مرکزی',
  'SYNTHETIC درمانگاه شمال',
  'SYNTHETIC کلینیک غرب',
  'SYNTHETIC بیمارستان دامپزشکی',
];

const url = process.env.DATABASE_URL ?? 'postgres://hamzist:hamzist_local_dev@127.0.0.1:5433/hamzist';
if (!/127\.0\.0\.1|localhost/.test(url) || process.env.APP_ENV === 'production') {
  console.error('dev-tidy only runs against a local development database.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
try {
  await pool.query('begin');

  const visits = await pool.query(`
    update vet_visit_request set status = 'CANCELLED', updated_at = now()
    where status in ('ACTIVE', 'CHECKED_IN')
    returning id`);
  await pool.query(`
    update referral_code c set status = 'CANCELLED'
    from vet_visit_request r
    where c.request_id = r.id and r.status = 'CANCELLED' and c.status = 'ACTIVE'`);

  // The kept four must actually be usable, or the Finder shows nothing: §11.1
  // asks for an active location with a valid licence and the mandatory
  // facilities. One is left without blood sampling on purpose, so the rule that
  // an incomplete location is absent stays visible when testing by hand, and one
  // carries the pregnancy check so that context has somewhere to go too.
  await pool.query(
    `update vet_location
     set is_active = true, licence_status = 'VALID',
         can_implant_microchip = true,
         can_draw_blood_sample = (name_fa <> $2),
         can_pregnancy_check = (name_fa = $3),
         updated_at = now()
     where name_fa = any($1::text[])`,
    [KEEP, 'SYNTHETIC درمانگاه شمال', 'SYNTHETIC بیمارستان دامپزشکی'],
  );

  const locations = await pool.query(
    `update vet_location set licence_status = 'EXPIRED', updated_at = now()
     where licence_status = 'VALID' and name_fa <> all($1::text[])
     returning id`,
    [KEEP],
  );

  await pool.query('commit');
  console.log(
    'cancelled visits: ' +
      visits.rowCount +
      ', retired locations: ' +
      locations.rowCount +
      ', kept: ' +
      KEEP.length,
  );
} catch (error) {
  await pool.query('rollback');
  throw error;
} finally {
  await pool.end();
}
