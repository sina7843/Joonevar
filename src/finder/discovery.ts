/**
 * Public discovery, match mode, favourites, saved searches and match notices —
 * PHASE-4 PROMPT-004.
 *
 * One query decides which profiles exist for this viewer: the same conditions
 * as `publicProfile` (listed state, activating owner still owner, registered,
 * alive, species open) plus the subscription matrix, all in SQL so a hidden
 * profile never leaves the database. The facts that need a rule or arithmetic
 * (cooldown, completeness, distance, compatibility) are computed in the
 * application over that set, then ordered with a keyset cursor.
 *
 * ponytail: the candidate set is capped at CANDIDATE_CAP rows and scored in
 * memory; move cooldown and completeness into SQL columns if the launch grows
 * past a few thousand active profiles per breed.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { animals } from '../db/schema/animals.ts';
import { referenceBreeds } from '../db/schema/core.ts';
import { residences } from '../db/schema/identity.ts';
import { finderFavorites, finderMatchNotices, finderSavedSearches, matingProfiles } from '../db/schema/finder.ts';
import { recordAudit } from '../audit/service.ts';
import { createNotification } from '../notifications/service.ts';
import { conflict, notFound, validation } from '../domain/errors.ts';
import { todayCivil } from '../domain/calendar.ts';
import { distanceKm } from '../domain/referral.ts';
import type { Actor } from '../authz/actor.ts';
import { speciesEnabled } from '../marketplace/species.ts';
import { hasFinderSubscription } from './subscriptions.ts';
import { finderFlagEnabled } from './flags.ts';
import { activeRule, type RuleRow } from './rules.ts';
import { buildCard, publicProfile, type ProfileCard } from './profiles.ts';
import { ageInMonths, completeness, cooldownState, PUBLIC_STATES, type CooldownState, type ProfileState } from './profile-model.ts';
import { evaluateCompatibility, roundedDistanceKm, type Evaluation, type SideFacts } from './compatibility.ts';
import { kinshipOf, KINSHIP_DEPTH, type Parents } from './kinship.ts';
import { decodeCursor, EMPTY_FILTERS, filtersToQuery, pageAfter, parseFilters, type SearchFilters } from './discovery-model.ts';

const CANDIDATE_CAP = 2000;
export const PAGE_SIZE = 12;

type CandidateRow = {
  readonly profile_id: string;
  readonly state: ProfileState;
  readonly activated_at: string | Date | null;
  readonly preferences_fa: string | null;
  readonly animal_id: string;
  readonly owner_account_id: string;
  readonly species: string;
  readonly breed_id: string | null;
  readonly sex: 'MALE' | 'FEMALE' | null;
  readonly birth_date: string | null;
  readonly identity_verified: boolean;
  readonly images: number;
  readonly has_video: boolean;
  readonly has_pedigree: boolean;
  readonly last_mated_on: string | null;
  readonly confirmed_count: number;
  readonly is_kennel: boolean;
  readonly lat: number | null;
  readonly lng: number | null;
};

interface Viewer {
  readonly accountId: string | null;
  readonly subscribed: boolean;
  readonly freePoolOpen: boolean;
}

/** Everything a viewer may see, narrowed by the filters SQL can apply. */
async function candidates(db: DbClient, viewer: Viewer, f: SearchFilters, now: Date, onlyProfileId: string | null): Promise<CandidateRow[]> {
  const today = todayCivil(now);
  const conditions = [
    sql`p.state in (${sql.join(PUBLIC_STATES.map((s) => sql`${s}`), sql`, `)})`,
    sql`p.owner_account_id = a.owner_account_id`,
    sql`a.status = 'REGISTERED'`,
    sql`exists (select 1 from marketplace_species ms where ms.market = 'MATING' and ms.species_code = a.species and ms.enabled)`,
    // Alive and not archived: the newest life event must not be one that takes the animal away.
    sql`not exists (
      select 1 from animal_life_event e where e.animal_id = a.id and e.kind in ('DECEASED', 'MISSING', 'ARCHIVED')
        and not exists (select 1 from animal_life_event e2 where e2.animal_id = a.id and (e2.created_at, e2.id) > (e.created_at, e.id))
    )`,
    // The subscription matrix (PRODUCT_DECISIONS §2): the same rule as profileVisible().
    sql`(
      exists (select 1 from finder_subscription_period s where s.account_id = a.owner_account_id and s.status = 'ACTIVE'
              and s.starts_at <= ${now} and ${now} < s.ends_at)
      or a.owner_account_id = ${viewer.accountId}
      or ${viewer.subscribed && viewer.freePoolOpen}
    )`,
  ];
  if (onlyProfileId) conditions.push(sql`p.id = ${onlyProfileId}`);
  if (f.breedId) conditions.push(sql`coalesce(b.merged_into_breed_id, a.breed_id) = ${f.breedId}`);
  if (f.sex) conditions.push(sql`a.sex = ${f.sex}`);
  if (f.province) conditions.push(sql`coalesce(k.province_fa, r.province) = ${f.province}`);
  if (f.city) conditions.push(sql`coalesce(k.city_fa, r.city) = ${f.city}`);
  if (f.pedigree === 'YES') conditions.push(sql`exists (select 1 from pedigree pd where pd.animal_id = a.id)`);
  if (f.pedigree === 'NO') conditions.push(sql`not exists (select 1 from pedigree pd where pd.animal_id = a.id)`);
  // Age bounds as birth-date bounds: born no later than today − min months, no earlier than today − max months.
  if (f.minAgeMonths !== null) conditions.push(sql`a.birth_date <= (${today}::date - make_interval(months => ${f.minAgeMonths}))`);
  if (f.maxAgeMonths !== null) conditions.push(sql`a.birth_date > (${today}::date - make_interval(months => ${f.maxAgeMonths + 1}))`);
  if (f.availability) conditions.push(sql`p.state = ${f.availability}`);

  const result = await db.execute<CandidateRow>(sql`
    select p.id as profile_id, p.state, p.activated_at, p.preferences_fa,
           a.id as animal_id, a.owner_account_id, a.species,
           coalesce(b.merged_into_breed_id, a.breed_id) as breed_id, a.sex, a.birth_date::text as birth_date,
           a.identity_verified_at is not null as identity_verified,
           (select count(*)::int from mating_profile_media m where m.profile_id = p.id and m.status = 'ACTIVE' and m.kind = 'IMAGE') as images,
           exists (select 1 from mating_profile_media m where m.profile_id = p.id and m.status = 'ACTIVE' and m.kind = 'VIDEO') as has_video,
           exists (select 1 from pedigree pd where pd.animal_id = a.id) as has_pedigree,
           lm.last_mated_on::text as last_mated_on, coalesce(lm.confirmed_count, 0)::int as confirmed_count,
           k.id is not null as is_kennel,
           coalesce(k.latitude, nullif(r.geo_lat, '')::double precision) as lat,
           coalesce(k.longitude, nullif(r.geo_lng, '')::double precision) as lng
    from mating_profile p
    join animal a on a.id = p.animal_id
    left join reference_breed b on b.id = a.breed_id
    left join animal_last_mating lm on lm.animal_id = a.id
    left join residence r on r.account_id = a.owner_account_id
    left join lateral (
      select kk.id, kk.province_fa, kk.city_fa, kk.latitude, kk.longitude from kennel kk
      where kk.owner_account_id = a.owner_account_id and kk.status = 'APPROVED' order by kk.created_at desc limit 1
    ) k on true
    where ${sql.join(conditions, sql` and `)}
    limit ${CANDIDATE_CAP}
  `);
  return result.rows;
}

/** Parents of every animal reachable from these, a whole generation per query. */
async function loadParents(db: DbClient, start: readonly string[]): Promise<Map<string, Parents>> {
  const parents = new Map<string, Parents>();
  let frontier = [...new Set(start)];
  for (let level = 0; level <= KINSHIP_DEPTH && frontier.length > 0; level += 1) {
    const rows = await db
      .select({ id: animals.id, sire: animals.sireAnimalId, dam: animals.damAnimalId })
      .from(animals)
      .where(inArray(animals.id, frontier));
    const next: string[] = [];
    for (const row of rows) {
      parents.set(row.id, { sire: row.sire, dam: row.dam });
      for (const p of [row.sire, row.dam]) if (p && !parents.has(p)) next.push(p);
    }
    frontier = [...new Set(next)].filter((id) => !parents.has(id));
  }
  return parents;
}

type RuleCache = Map<string, Promise<RuleRow | null>>;
const ruleFor = (db: DbClient, cache: RuleCache, species: string, breedId: string | null, sex: 'MALE' | 'FEMALE' | null) => {
  if (sex === null) return Promise.resolve(null);
  const key = species + ':' + (breedId ?? '*') + ':' + sex;
  if (!cache.has(key)) cache.set(key, activeRule(db, species, breedId, sex));
  return cache.get(key)!;
};

interface Derived {
  readonly row: CandidateRow;
  readonly side: SideFacts;
  readonly cooldown: CooldownState;
  readonly distanceKm: number | null;
}

async function derive(db: DbClient, rules: RuleCache, row: CandidateRow, today: string, from: { lat: number; lng: number } | null): Promise<Derived> {
  const rule = await ruleFor(db, rules, row.species, row.breed_id, row.sex);
  const cooldown = cooldownState(rule, row.last_mated_on, today);
  const km = from && row.lat !== null && row.lng !== null ? roundedDistanceKm(distanceKm(from, { lat: Number(row.lat), lng: Number(row.lng) })) : null;
  return {
    row,
    cooldown,
    distanceKm: km,
    side: {
      animalId: row.animal_id,
      species: row.species,
      breedId: row.breed_id,
      sex: row.sex,
      ageMonths: row.birth_date ? ageInMonths(row.birth_date, today) : null,
      rule,
      cooldown,
      confirmedMatings: Number(row.confirmed_count),
      completeness: completeness({
        hasPedigree: row.has_pedigree,
        identityVerifiedByVet: row.identity_verified,
        imageCount: Number(row.images),
        hasVideo: row.has_video,
        hasPreferences: (row.preferences_fa ?? '') !== '',
      }),
      hasPedigree: row.has_pedigree,
    },
  };
}

function passesAppFilters(d: Derived, f: SearchFilters, today: string): boolean {
  if (f.cooldown === 'CLEAR' && d.cooldown.state === 'IN_COOLDOWN') return false;
  if (f.ownerKind === 'KENNEL' && !d.row.is_kennel) return false;
  if (f.ownerKind === 'OWNER' && d.row.is_kennel) return false;
  if (d.side.completeness.score < f.minCompleteness) return false;
  if (f.maxDistanceKm !== null && (d.distanceKm === null || d.distanceKm > f.maxDistanceKm)) return false;
  if (f.lastMating === 'NONE' && d.row.last_mated_on !== null) return false;
  if (f.lastMating !== 'ANY' && f.lastMating !== 'NONE' && d.row.last_mated_on !== null) {
    const days = (Date.parse(today) - Date.parse(d.row.last_mated_on)) / 86_400_000;
    if (days < Number(f.lastMating)) return false;
  }
  return true;
}

export interface SearchItem {
  readonly profileId: string;
  readonly sortKey: number;
  readonly card: ProfileCard;
  readonly evaluation: Evaluation | null;
  readonly distanceKm: number | null;
  readonly favorite: boolean;
}

export interface SearchResult {
  readonly closed: boolean;
  readonly mode: 'BROWSE' | 'MATCH';
  readonly forAnimal: { readonly id: string; readonly nameFa: string } | null;
  readonly problemFa: string | null;
  readonly total: number;
  readonly items: readonly SearchItem[];
  readonly next: string | null;
  readonly filters: SearchFilters;
}

async function viewerLocation(db: DbClient, accountId: string | null): Promise<{ lat: number; lng: number } | null> {
  if (accountId === null) return null;
  const [row] = await db.select({ lat: residences.geoLat, lng: residences.geoLng }).from(residences).where(eq(residences.accountId, accountId)).limit(1);
  const lat = Number(row?.lat);
  const lng = Number(row?.lng);
  return row?.lat && row?.lng && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/**
 * The search. `raw` is the query string; `onlyProfileId` restricts it to one
 * profile, which is how a new profile is matched against saved searches.
 */
export async function searchProfiles(
  db: DbClient,
  viewerActor: Actor | null,
  raw: Readonly<Record<string, unknown>>,
  options: { readonly now?: Date; readonly pageSize?: number; readonly onlyProfileId?: string | null } = {},
): Promise<SearchResult> {
  const now = options.now ?? new Date();
  const today = todayCivil(now);
  let filters = parseFilters(raw);
  const empty = (problemFa: string | null, closed = false): SearchResult => ({
    closed,
    mode: 'BROWSE',
    forAnimal: null,
    problemFa,
    total: 0,
    items: [],
    next: null,
    filters,
  });
  if (!(await finderFlagEnabled(db, 'finder.flag.discovery'))) return empty(null, true);

  const accountId = viewerActor?.accountId ?? null;
  const viewer: Viewer = {
    accountId,
    subscribed: accountId !== null && (await hasFinderSubscription(db, accountId, now)),
    freePoolOpen: await finderFlagEnabled(db, 'finder.flag.free_pool_visibility'),
  };
  const rules: RuleCache = new Map();
  const from = await viewerLocation(db, accountId);

  // Match mode: one of the viewer's own animals decides breed and sex; nobody else's may be named.
  let mine: Derived | null = null;
  let forAnimal: SearchResult['forAnimal'] = null;
  if (filters.forAnimalId) {
    const [animal] = await db
      .select({ animal: animals, mergedInto: referenceBreeds.mergedIntoBreedId })
      .from(animals)
      .leftJoin(referenceBreeds, eq(referenceBreeds.id, animals.breedId))
      .where(eq(animals.id, filters.forAnimalId))
      .limit(1);
    if (!animal || animal.animal.ownerAccountId !== accountId || animal.animal.status !== 'REGISTERED' || !(await speciesEnabled(db, 'MATING', animal.animal.species))) {
      return { ...empty('این حیوان برای جست‌وجوی جفت در دسترس نیست.'), filters: { ...filters, forAnimalId: null } };
    }
    const a = animal.animal;
    const breedId = animal.mergedInto ?? a.breedId;
    if (!breedId || !a.sex) return empty('نژاد و جنس حیوان شما باید ثبت شده باشد.');
    const [ownRow] = await candidatesForOwn(db, a.id);
    mine = await derive(
      db,
      rules,
      ownRow ?? {
        profile_id: '',
        state: 'INACTIVE',
        activated_at: null,
        preferences_fa: null,
        animal_id: a.id,
        owner_account_id: a.ownerAccountId,
        species: a.species,
        breed_id: breedId,
        sex: a.sex,
        birth_date: a.birthDate,
        identity_verified: a.identityVerifiedAt !== null,
        images: 0,
        has_video: false,
        has_pedigree: false,
        last_mated_on: null,
        confirmed_count: 0,
        is_kennel: false,
        lat: null,
        lng: null,
      },
      today,
      null,
    );
    forAnimal = { id: a.id, nameFa: a.name ?? 'حیوان شما' };
    // Same breed, opposite sex: forced, whatever the query string said.
    filters = { ...filters, breedId, sex: a.sex === 'MALE' ? 'FEMALE' : 'MALE' };
  }

  const rows = (await candidates(db, viewer, filters, now, options.onlyProfileId ?? null)).filter((r) => r.animal_id !== filters.forAnimalId);
  const derived = (await Promise.all(rows.map((row) => derive(db, rules, row, today, from)))).filter((d) => passesAppFilters(d, filters, today));

  let evaluations = new Map<string, Evaluation>();
  if (mine) {
    const parents = await loadParents(db, [mine.side.animalId, ...derived.map((d) => d.side.animalId)]);
    const mySide = mine.side;
    evaluations = new Map(
      derived.map((d) => [
        d.row.profile_id,
        evaluateCompatibility({
          mine: mySide,
          other: d.side,
          kinship: kinshipOf(mySide.animalId, d.side.animalId, parents),
          distanceKm: d.distanceKm,
          preferences: { maxDistanceKm: filters.maxDistanceKm, pedigreeRequired: filters.pedigree === 'YES' },
        }),
      ]),
    );
  }

  const sortable = derived.map((d) => ({
    profileId: d.row.profile_id,
    sortKey: mine ? evaluations.get(d.row.profile_id)!.score : d.row.activated_at ? new Date(d.row.activated_at).getTime() : 0,
    d,
  }));
  const { page, next } = pageAfter(sortable, decodeCursor(raw.cursor), options.pageSize ?? PAGE_SIZE);

  const favorites = new Set<string>();
  if (accountId && page.length > 0) {
    const favs = await db
      .select({ profileId: finderFavorites.profileId })
      .from(finderFavorites)
      .where(and(eq(finderFavorites.accountId, accountId), inArray(finderFavorites.profileId, page.map((p) => p.profileId))));
    for (const f of favs) favorites.add(f.profileId);
  }
  const items = await Promise.all(
    page.map(async (item) => {
      const [row] = await db
        .select({ profile: matingProfiles, animal: animals })
        .from(matingProfiles)
        .innerJoin(animals, eq(animals.id, matingProfiles.animalId))
        .where(eq(matingProfiles.id, item.profileId))
        .limit(1);
      return {
        profileId: item.profileId,
        sortKey: item.sortKey,
        card: await buildCard(db, row!.profile, row!.animal, now),
        evaluation: evaluations.get(item.profileId) ?? null,
        distanceKm: item.d.distanceKm,
        favorite: favorites.has(item.profileId),
      };
    }),
  );
  return { closed: false, mode: mine ? 'MATCH' : 'BROWSE', forAnimal, problemFa: null, total: sortable.length, items, next, filters };
}

/** The viewer's own animal as a candidate row, whatever its profile state. */
async function candidatesForOwn(db: DbClient, animalId: string): Promise<CandidateRow[]> {
  const result = await db.execute<CandidateRow>(sql`
    select coalesce(p.id::text, '') as profile_id, coalesce(p.state::text, 'INACTIVE') as state, p.activated_at, p.preferences_fa,
           a.id as animal_id, a.owner_account_id, a.species,
           coalesce(b.merged_into_breed_id, a.breed_id) as breed_id, a.sex, a.birth_date::text as birth_date,
           a.identity_verified_at is not null as identity_verified,
           0 as images, false as has_video,
           exists (select 1 from pedigree pd where pd.animal_id = a.id) as has_pedigree,
           lm.last_mated_on::text as last_mated_on, coalesce(lm.confirmed_count, 0)::int as confirmed_count,
           false as is_kennel, null::double precision as lat, null::double precision as lng
    from animal a
    left join mating_profile p on p.animal_id = a.id
    left join reference_breed b on b.id = a.breed_id
    left join animal_last_mating lm on lm.animal_id = a.id
    where a.id = ${animalId}
  `);
  return result.rows;
}

// ── favourites ───────────────────────────────────────────────────────────────

/** Add or remove. Only a profile the viewer can see right now can be added. */
export async function toggleFavorite(db: Database, actor: Actor, profileId: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: finderFavorites.id })
    .from(finderFavorites)
    .where(and(eq(finderFavorites.accountId, actor.accountId), eq(finderFavorites.profileId, profileId)))
    .limit(1);
  if (existing) {
    await db.delete(finderFavorites).where(eq(finderFavorites.id, existing.id));
    return false;
  }
  if (!(await publicProfile(db, actor.accountId, profileId))) throw notFound('این پروفایل پیدا نشد.');
  await db.insert(finderFavorites).values({ accountId: actor.accountId, profileId }).onConflictDoNothing();
  return true;
}

/** The viewer's favourites; one no longer visible to them is listed without any of its details. */
export async function myFavorites(db: DbClient, actor: Actor): Promise<ReadonlyArray<{ profileId: string; card: ProfileCard | null }>> {
  const rows = await db.select().from(finderFavorites).where(eq(finderFavorites.accountId, actor.accountId));
  return Promise.all(rows.map(async (row) => ({ profileId: row.profileId, card: await publicProfile(db, actor.accountId, row.profileId) })));
}

// ── saved searches and match notices ─────────────────────────────────────────

export async function saveSearch(
  db: Database,
  actor: Actor,
  input: { nameFa: string; raw: Readonly<Record<string, unknown>>; notify: boolean },
): Promise<{ id: string }> {
  const nameFa = input.nameFa.trim();
  if (nameFa === '' || nameFa.length > 80) throw validation('نام جست‌وجو را بنویسید (حداکثر ۸۰ نویسه).');
  const filters = parseFilters(input.raw);
  if (JSON.stringify(filters) === JSON.stringify(EMPTY_FILTERS)) throw validation('جست‌وجوی بدون هیچ فیلتری ذخیره نمی‌شود.');
  if (filters.forAnimalId) {
    const [own] = await db.select({ owner: animals.ownerAccountId }).from(animals).where(eq(animals.id, filters.forAnimalId)).limit(1);
    if (own?.owner !== actor.accountId) throw notFound('این حیوان پیدا نشد.');
  }
  const [count] = await db.execute<{ n: number }>(sql`select count(*)::int as n from finder_saved_search where account_id = ${actor.accountId}`).then((r) => r.rows);
  if (Number(count?.n ?? 0) >= 20) throw conflict('حداکثر ۲۰ جست‌وجوی ذخیره‌شده دارید؛ یکی را حذف کنید.');
  const [row] = await db
    .insert(finderSavedSearches)
    .values({ accountId: actor.accountId, nameFa, filters, forAnimalId: filters.forAnimalId, notify: input.notify })
    .returning({ id: finderSavedSearches.id });
  await recordAudit(db, actor, { action: 'FINDER_SEARCH_SAVED', targetType: 'FINDER_SAVED_SEARCH', targetId: row!.id, after: { notify: input.notify } });
  return row!;
}

export async function mySavedSearches(db: DbClient, actor: Actor) {
  return db.select().from(finderSavedSearches).where(eq(finderSavedSearches.accountId, actor.accountId));
}

export async function deleteSavedSearch(db: Database, actor: Actor, id: string): Promise<void> {
  const deleted = await db
    .delete(finderSavedSearches)
    .where(and(eq(finderSavedSearches.id, id), eq(finderSavedSearches.accountId, actor.accountId)))
    .returning({ id: finderSavedSearches.id });
  if (deleted.length === 0) throw notFound('این جست‌وجو پیدا نشد.');
}

/**
 * When a profile becomes visible, every saved search it now matches gets one
 * notice — once per (search, profile), however many times the profile comes
 * and goes. Each search is run as its owner, so a search never learns about a
 * profile its owner could not see. Runs inside the caller's transaction.
 *
 * ponytail: one restricted search per notifying saved search; batch by filter
 * shape if saved searches reach the thousands.
 */
export async function noticeMatches(tx: DbClient, profileId: string, now: Date = new Date()): Promise<number> {
  const [profile] = await tx.select({ owner: matingProfiles.ownerAccountId }).from(matingProfiles).where(eq(matingProfiles.id, profileId)).limit(1);
  if (!profile) return 0;
  // Nobody is told about their own animal.
  const searches = (await tx.select().from(finderSavedSearches).where(eq(finderSavedSearches.notify, true))).filter(
    (search) => search.accountId !== profile.owner,
  );
  let created = 0;
  const notify = await finderFlagEnabled(tx, 'finder.flag.notifications');
  for (const search of searches) {
    const owner: Actor = { accountId: search.accountId as never, context: 'USER', activeRoles: [] };
    const result = await searchProfiles(tx, owner, filtersToQuery(search.filters as SearchFilters), { now, onlyProfileId: profileId, pageSize: 1 });
    if (result.items.length === 0) continue;
    // A match search does not announce a pair the rules would refuse.
    if (result.items[0]!.evaluation?.blockers.length) continue;
    const inserted = await tx.insert(finderMatchNotices).values({ savedSearchId: search.id, profileId }).onConflictDoNothing().returning({ id: finderMatchNotices.id });
    if (inserted.length === 0) continue;
    created += 1;
    if (notify) {
      await createNotification(tx, {
        recipientAccountId: search.accountId,
        kind: 'FINDER_SAVED_SEARCH_MATCH',
        titleFa: 'حیوان تازه‌ای با جست‌وجوی «' + search.nameFa + '» جور است',
        bodyFa: 'یک پروفایل جفت‌یابی تازه با فیلترهای ذخیره‌شده شما مطابقت دارد.',
        resume: { entity: { type: 'ANIMAL', id: result.items[0]!.card.animalId }, step: 'FINDER_MATCH', originRoute: '/mating-finder/' + profileId },
      });
    }
  }
  return created;
}
