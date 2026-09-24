/**
 * The club joining rules — Phase 2.5 §9 (PROMPT-013).
 *
 * A club's rules are **data**, never code. A rule is one of a fixed, allowlisted
 * set of questions, each with its own small set of typed parameters, and the
 * only structure around them is an ALL or ANY group with bounded nesting.
 * Nothing here parses an expression, builds a function or reaches for `eval`:
 * a tree the validator accepted can only ask the questions listed below, so a
 * club admin can write a demanding rule set but never a program.
 *
 * Evaluation is a pure function of a facts record that the server gathers from
 * the authoritative read-side of each domain. The club never writes those facts,
 * and never receives them: what comes back is one boolean per condition and a
 * sentence for each unmet one (§20 — a club learns whether somebody qualifies,
 * not what they own).
 */

/** How far the club may nest groups, and how large a rule set may get. */
export const MAX_RULE_DEPTH = 3;
export const MAX_RULE_NODES = 40;

export const CLUB_RULE_KINDS = [
  'ACCOUNT_ACTIVE',
  'IDENTITY_VERIFIED',
  'ASSOCIATION_MEMBERSHIP',
  'OWNS_DOG',
  'KENNEL_APPROVED',
  'PEDIGREE',
  'MICROCHIP',
  'VET_STATUS',
  'TERMS_ACCEPTED',
  'FEE_PAID',
  'CLUB_APPROVAL',
] as const;
export type ClubRuleKind = (typeof CLUB_RULE_KINDS)[number];

/**
 * A FACT rule asks about the world and decides eligibility. A FLOW rule is part
 * of joining itself — accepting the terms, paying the fee, being approved — and
 * an applicant who fails only these is not ineligible, they are mid-journey.
 */
export const RULE_STAGE: Record<ClubRuleKind, 'FACT' | 'FLOW'> = {
  ACCOUNT_ACTIVE: 'FACT',
  IDENTITY_VERIFIED: 'FACT',
  ASSOCIATION_MEMBERSHIP: 'FACT',
  OWNS_DOG: 'FACT',
  KENNEL_APPROVED: 'FACT',
  PEDIGREE: 'FACT',
  MICROCHIP: 'FACT',
  VET_STATUS: 'FACT',
  TERMS_ACCEPTED: 'FLOW',
  FEE_PAID: 'FLOW',
  CLUB_APPROVAL: 'FLOW',
};

export const RULE_KIND_FA: Record<ClubRuleKind, string> = {
  ACCOUNT_ACTIVE: 'حساب فعال در همزیست',
  IDENTITY_VERIFIED: 'احراز هویت تأییدشده',
  ASSOCIATION_MEMBERSHIP: 'عضویت معتبر انجمن',
  OWNS_DOG: 'داشتن سگ ثبت‌شده',
  KENNEL_APPROVED: 'کنل تأییدشده',
  PEDIGREE: 'شجره‌نامه صادرشده',
  MICROCHIP: 'میکروچیپ ثبت‌شده',
  VET_STATUS: 'وضعیت دامپزشکی',
  TERMS_ACCEPTED: 'پذیرش شرایط کلاب',
  FEE_PAID: 'پرداخت حق عضویت',
  CLUB_APPROVAL: 'تأیید دستی کلاب',
};

export const VET_STATUSES = ['LICENSED', 'TRUSTED'] as const;
export type VetStatusRequirement = (typeof VET_STATUSES)[number];

export const VET_STATUS_FA: Record<VetStatusRequirement, string> = {
  LICENSED: 'دامپزشک دارای پروانه فعالیت',
  TRUSTED: 'دامپزشک معتمد همزیست',
};

export type ClubRuleNode =
  | { readonly type: 'GROUP'; readonly op: 'ALL' | 'ANY'; readonly children: readonly ClubRuleNode[] }
  | { readonly type: 'RULE'; readonly kind: ClubRuleKind; readonly params?: Readonly<Record<string, unknown>> };

/** What the facts record has to answer. Every field is read-only server truth. */
export interface ClubApplicantFacts {
  readonly accountActive: boolean;
  readonly identityVerified: boolean;
  readonly associationMembershipValid: boolean;
  /** Dogs this account owns, and how many of each breed. */
  readonly dogCount: number;
  readonly dogCountByBreed: Readonly<Record<string, number>>;
  readonly kennelApproved: boolean;
  /** Owned animals carrying an issued pedigree, and a permanently registered chip. */
  readonly pedigreeCount: number;
  readonly chippedDogCount: number;
  readonly vetStatus: 'NONE' | VetStatusRequirement;
  readonly acceptedTermsVersion: string | null;
  readonly feePaid: boolean;
  readonly clubApproved: boolean;
}

/** What the rule set is being judged against besides the applicant themselves. */
export interface ClubRuleContext {
  /** The terms version the club currently publishes, if it asks for terms at all. */
  readonly termsVersion: string | null;
  /** Breed names for the explanations; ids the club chose are meaningless to a person. */
  readonly breedNamesFa?: Readonly<Record<string, string>>;
}

type ParamSpec =
  | { readonly key: string; readonly kind: 'count'; readonly max: number; readonly optional?: true }
  | { readonly key: string; readonly kind: 'uuid'; readonly optional?: true }
  | { readonly key: string; readonly kind: 'enum'; readonly values: readonly string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The whole vocabulary. A parameter that is not listed here cannot be stored. */
const PARAMS: Record<ClubRuleKind, readonly ParamSpec[]> = {
  ACCOUNT_ACTIVE: [],
  IDENTITY_VERIFIED: [],
  ASSOCIATION_MEMBERSHIP: [],
  OWNS_DOG: [
    { key: 'minCount', kind: 'count', max: 20, optional: true },
    { key: 'breedId', kind: 'uuid', optional: true },
  ],
  KENNEL_APPROVED: [],
  PEDIGREE: [{ key: 'minCount', kind: 'count', max: 20, optional: true }],
  MICROCHIP: [{ key: 'minCount', kind: 'count', max: 20, optional: true }],
  VET_STATUS: [{ key: 'status', kind: 'enum', values: VET_STATUSES }],
  TERMS_ACCEPTED: [],
  FEE_PAID: [],
  CLUB_APPROVAL: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const countOf = (params: Readonly<Record<string, unknown>> | undefined, key = 'minCount'): number => {
  const raw = params?.[key];
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : 1;
};

const fa = (value: number): string => value.toLocaleString('fa-IR');

/**
 * Validate a tree the club submitted. Everything unknown is refused rather than
 * ignored, so a rule set never silently means something other than it says.
 */
export function validateRuleTree(value: unknown): { problems: string[]; nodes: number; depth: number } {
  const problems: string[] = [];
  let nodes = 0;
  let deepest = 0;

  const walk = (node: unknown, depth: number, path: string): void => {
    nodes += 1;
    deepest = Math.max(deepest, depth);
    if (nodes > MAX_RULE_NODES) {
      if (nodes === MAX_RULE_NODES + 1) problems.push('تعداد شرط‌ها بیش از ' + fa(MAX_RULE_NODES) + ' مورد است؛ آن را ساده‌تر کنید.');
      return;
    }
    if (!isRecord(node)) {
      problems.push(path + ': شرط باید یک شیء باشد.');
      return;
    }
    if (node.type === 'GROUP') {
      if (depth >= MAX_RULE_DEPTH) {
        problems.push(path + ': گروه‌ها بیش از ' + fa(MAX_RULE_DEPTH) + ' لایه تو در تو نمی‌شوند.');
        return;
      }
      if (node.op !== 'ALL' && node.op !== 'ANY') {
        problems.push(path + ': نوع گروه باید «همه» یا «هر یک» باشد.');
        return;
      }
      if (!Array.isArray(node.children) || node.children.length === 0) {
        problems.push(path + ': گروه بدون شرط معنا ندارد.');
        return;
      }
      node.children.forEach((child, index) => walk(child, depth + 1, path + '.' + (index + 1)));
      return;
    }
    if (node.type !== 'RULE') {
      problems.push(path + ': نوع گره باید گروه یا شرط باشد.');
      return;
    }
    if (typeof node.kind !== 'string' || !(CLUB_RULE_KINDS as readonly string[]).includes(node.kind)) {
      problems.push(path + ': این شرط در فهرست شرط‌های مجاز نیست.');
      return;
    }
    const kind = node.kind as ClubRuleKind;
    const specs = PARAMS[kind];
    const params = node.params === undefined ? {} : node.params;
    if (!isRecord(params)) {
      problems.push(path + ': تنظیمات شرط باید یک شیء باشد.');
      return;
    }
    for (const key of Object.keys(params)) {
      if (!specs.some((spec) => spec.key === key)) problems.push(path + ': تنظیم ناشناخته «' + key + '» برای ' + RULE_KIND_FA[kind] + '.');
    }
    for (const spec of specs) {
      const raw = params[spec.key];
      if (raw === undefined || raw === null) {
        if (!('optional' in spec) || spec.optional !== true) problems.push(path + ': ' + RULE_KIND_FA[kind] + ' بدون تعیین «' + spec.key + '» کامل نیست.');
        continue;
      }
      if (spec.kind === 'count' && !(typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= spec.max)) {
        problems.push(path + ': «' + spec.key + '» باید عددی درست بین ۱ و ' + fa(spec.max) + ' باشد.');
      }
      if (spec.kind === 'uuid' && !(typeof raw === 'string' && UUID.test(raw))) {
        problems.push(path + ': «' + spec.key + '» باید شناسه معتبر باشد.');
      }
      if (spec.kind === 'enum' && !(typeof raw === 'string' && spec.values.includes(raw))) {
        problems.push(path + ': «' + spec.key + '» باید یکی از مقادیر مجاز باشد.');
      }
    }
  };

  walk(value, 0, 'شرط');
  return { problems, nodes, depth: deepest };
}

export const isRuleTree = (value: unknown): value is ClubRuleNode => validateRuleTree(value).problems.length === 0;

/** An empty rule set: a club that asks nothing of an applicant still has a tree. */
export const EMPTY_RULES: ClubRuleNode = { type: 'GROUP', op: 'ALL', children: [{ type: 'RULE', kind: 'ACCOUNT_ACTIVE' }] };

export interface RuleOutcome {
  readonly kind: ClubRuleKind;
  readonly stage: 'FACT' | 'FLOW';
  readonly met: boolean;
  /** Said to the applicant when it is not met, in words they can act on. */
  readonly labelFa: string;
}

export interface RuleEvaluation {
  readonly met: boolean;
  /** Every rule that was actually consulted, in the order the tree names them. */
  readonly outcomes: readonly RuleOutcome[];
  /** Only the ones that actually stand in the way, after ANY groups are resolved. */
  readonly unmetFa: readonly string[];
  readonly unmetStages: { readonly fact: number; readonly flow: number };
}

function describe(kind: ClubRuleKind, params: Readonly<Record<string, unknown>> | undefined, context: ClubRuleContext): string {
  switch (kind) {
    case 'ACCOUNT_ACTIVE':
      return 'حساب شما باید در همزیست فعال باشد.';
    case 'IDENTITY_VERIFIED':
      return 'احراز هویت شما باید تأیید شده باشد.';
    case 'ASSOCIATION_MEMBERSHIP':
      return 'عضویت معتبر انجمن لازم است.';
    case 'OWNS_DOG': {
      const count = countOf(params);
      const breedId = typeof params?.breedId === 'string' ? params.breedId : null;
      const breed = breedId === null ? null : (context.breedNamesFa?.[breedId] ?? null);
      const what = breedId === null ? 'سگ ثبت‌شده' : 'سگ از نژاد ' + (breed ?? 'انتخاب‌شده کلاب');
      return 'داشتن دست‌کم ' + fa(count) + ' ' + what + ' لازم است.';
    }
    case 'KENNEL_APPROVED':
      return 'داشتن کنل تأییدشده لازم است.';
    case 'PEDIGREE':
      return 'دست‌کم ' + fa(countOf(params)) + ' شجره‌نامه صادرشده لازم است.';
    case 'MICROCHIP':
      return 'دست‌کم ' + fa(countOf(params)) + ' سگ با میکروچیپ ثبت‌شده لازم است.';
    case 'VET_STATUS': {
      const status = params?.status === 'TRUSTED' ? 'TRUSTED' : 'LICENSED';
      return 'این کلاب فقط ' + VET_STATUS_FA[status] + ' می‌پذیرد.';
    }
    case 'TERMS_ACCEPTED':
      return context.termsVersion === null ? 'پذیرش شرایط کلاب لازم است.' : 'شرایط کلاب را در نسخه جاری بپذیرید.';
    case 'FEE_PAID':
      return 'پرداخت حق عضویت کلاب لازم است.';
    case 'CLUB_APPROVAL':
      return 'درخواست شما در انتظار تأیید مدیر کلاب است.';
  }
}

function holds(kind: ClubRuleKind, params: Readonly<Record<string, unknown>> | undefined, facts: ClubApplicantFacts, context: ClubRuleContext): boolean {
  switch (kind) {
    case 'ACCOUNT_ACTIVE':
      return facts.accountActive;
    case 'IDENTITY_VERIFIED':
      return facts.identityVerified;
    case 'ASSOCIATION_MEMBERSHIP':
      return facts.associationMembershipValid;
    case 'OWNS_DOG': {
      const breedId = typeof params?.breedId === 'string' ? params.breedId : null;
      const owned = breedId === null ? facts.dogCount : (facts.dogCountByBreed[breedId] ?? 0);
      return owned >= countOf(params);
    }
    case 'KENNEL_APPROVED':
      return facts.kennelApproved;
    case 'PEDIGREE':
      return facts.pedigreeCount >= countOf(params);
    case 'MICROCHIP':
      return facts.chippedDogCount >= countOf(params);
    case 'VET_STATUS':
      // A trusted veterinarian is licensed too; being licensed is not being trusted.
      return params?.status === 'TRUSTED' ? facts.vetStatus === 'TRUSTED' : facts.vetStatus !== 'NONE';
    case 'TERMS_ACCEPTED':
      return context.termsVersion === null
        ? facts.acceptedTermsVersion !== null
        : facts.acceptedTermsVersion === context.termsVersion;
    case 'FEE_PAID':
      return facts.feePaid;
    case 'CLUB_APPROVAL':
      return facts.clubApproved;
  }
}

/**
 * Evaluate a validated tree. Unmet reasons are collected only from the branches
 * that actually decided the answer: inside a satisfied ANY group nothing is
 * unmet, and a group that failed reports the conditions of that group rather
 * than every leaf in the tree.
 */
export function evaluateRules(tree: ClubRuleNode, facts: ClubApplicantFacts, context: ClubRuleContext): RuleEvaluation {
  const outcomes: RuleOutcome[] = [];
  const unmet: RuleOutcome[] = [];

  const walk = (node: ClubRuleNode, collect: boolean): boolean => {
    if (node.type === 'GROUP') {
      if (node.op === 'ALL') {
        // Every child is consulted, so the applicant is told everything they lack.
        let met = true;
        for (const child of node.children) met = walk(child, collect) && met;
        return met;
      }
      const results = node.children.map((child) => walk(child, false));
      const met = results.some(Boolean);
      // An ANY group that failed explains its own alternatives, once.
      if (!met && collect) for (const child of node.children) walk(child, true);
      return met;
    }
    const met = holds(node.kind, node.params, facts, context);
    const outcome: RuleOutcome = { kind: node.kind, stage: RULE_STAGE[node.kind], met, labelFa: describe(node.kind, node.params, context) };
    if (!outcomes.some((seen) => seen.kind === outcome.kind && seen.labelFa === outcome.labelFa)) outcomes.push(outcome);
    if (!met && collect && !unmet.some((seen) => seen.labelFa === outcome.labelFa)) unmet.push(outcome);
    return met;
  };

  const met = walk(tree, true);
  return {
    met,
    outcomes,
    unmetFa: unmet.map((outcome) => outcome.labelFa),
    unmetStages: {
      fact: unmet.filter((outcome) => outcome.stage === 'FACT').length,
      flow: unmet.filter((outcome) => outcome.stage === 'FLOW').length,
    },
  };
}

/** Does this rule set ask for a particular flow step at all? */
export function ruleTreeAsks(tree: ClubRuleNode, kind: ClubRuleKind): boolean {
  if (tree.type === 'RULE') return tree.kind === kind;
  return tree.children.some((child) => ruleTreeAsks(child, kind));
}

/** The rule kinds a set uses, for the club's own summary of its rules. */
export function ruleTreeKinds(tree: ClubRuleNode): ClubRuleKind[] {
  const seen: ClubRuleKind[] = [];
  const walk = (node: ClubRuleNode): void => {
    if (node.type === 'RULE') {
      if (!seen.includes(node.kind)) seen.push(node.kind);
      return;
    }
    node.children.forEach(walk);
  };
  walk(tree);
  return seen;
}

/** Facts for the club's own preview: nobody real, and nothing read from anybody. */
export const SAMPLE_FACTS: ClubApplicantFacts = {
  accountActive: true,
  identityVerified: true,
  associationMembershipValid: false,
  dogCount: 1,
  dogCountByBreed: {},
  kennelApproved: false,
  pedigreeCount: 0,
  chippedDogCount: 1,
  vetStatus: 'NONE',
  acceptedTermsVersion: null,
  feePaid: false,
  clubApproved: false,
};
