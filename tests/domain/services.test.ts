/**
 * The service catalogue — Phase 2 PROMPT-013.
 *
 * §18 says what a service page must carry, and the fixed rules say what it may
 * never carry: an invented tariff, a promised time, or a second way into a
 * Phase 1 flow. This test holds the catalogue to both.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SERVICE_CATALOGUE, serviceBySlug, servicePath, servicePaths } from '../../src/services/catalogue.ts';
import { SETTING_BY_KEY } from '../../src/settings/keys.ts';
import { accessForRoute } from '../../src/authz/routes.ts';

test('every service says what §18 requires', () => {
  assert.ok(SERVICE_CATALOGUE.length >= 6);
  for (const service of SERVICE_CATALOGUE) {
    assert.match(service.slug, /^[a-z][a-z-]{2,30}$/, service.slug);
    assert.ok(service.titleFa.trim() !== '', service.slug);
    assert.ok(service.definitionFa.length > 40, service.slug + ' has a real definition');
    assert.ok(service.audienceFa.trim() !== '', service.slug + ' names its audience');
    assert.ok(service.prerequisitesFa.length > 0, service.slug + ' names its prerequisites');
    assert.ok(service.stepsFa.length >= 3, service.slug + ' lists its steps');
    assert.ok(service.documentsFa.length > 0, service.slug + ' lists its documents');
    assert.ok(service.faq.length > 0, service.slug + ' answers at least one question');
    assert.ok(service.cta.href.startsWith('/'), service.slug);
  }
  // Slugs are unique, so one address never describes two services.
  assert.equal(new Set(SERVICE_CATALOGUE.map((service) => service.slug)).size, SERVICE_CATALOGUE.length);
});

test('a fee is a managed setting key, never a number written on the page', () => {
  for (const service of SERVICE_CATALOGUE) {
    if (service.feeSettingKey === null) continue;
    assert.ok(SETTING_BY_KEY.has(service.feeSettingKey), service.slug + ' points at a real setting');
    assert.equal(SETTING_BY_KEY.get(service.feeSettingKey)!.kind, 'MONEY_TOMAN', service.slug);
  }
  for (const service of SERVICE_CATALOGUE) {
    if (!service.noticeSettingKey) continue;
    assert.ok(SETTING_BY_KEY.has(service.noticeSettingKey), service.slug + ' points at a real notice');
  }

  // No digit group that looks like a tariff appears in the page text itself.
  const money = /[\d۰-۹]{3}[\d۰-۹٬,]*\s*(تومان|ریال)/;
  for (const service of SERVICE_CATALOGUE) {
    const text = [
      service.summaryFa,
      service.definitionFa,
      service.audienceFa,
      ...service.stepsFa,
      ...service.documentsFa,
      ...service.prerequisitesFa,
      ...service.faq.flatMap((entry) => [entry.question, entry.answer]),
    ].join(' ');
    assert.equal(money.test(text), false, service.slug + ' writes no tariff of its own');
  }
});

test('no service promises a time, an appointment or a duration', () => {
  // §18 allows a time only where real data exists, and none does.
  const timing = /(ظرف|طی|حداکثر تا|کمتر از)\s*[\d۰-۹]|روز کاری|ساعت کاری|نوبت‌دهی می‌کند|رزرو نوبت|تضمین زمان/;
  for (const service of SERVICE_CATALOGUE) {
    const text = [service.summaryFa, service.definitionFa, ...service.stepsFa, ...service.faq.map((entry) => entry.answer)].join(' ');
    assert.equal(timing.test(text), false, service.slug + ' promises no time');
  }
});

test('every call to action goes to a route that already exists and is not public', () => {
  for (const service of SERVICE_CATALOGUE) {
    const access = accessForRoute(service.cta.href);
    // The service is performed inside the signed-in application, so its route is
    // guarded: a public page never becomes a second, unguarded way in.
    assert.notEqual(access, 'PUBLIC', service.slug + ' sends the visitor into the application');
    assert.ok(Array.isArray(access) && access.length > 0, service.slug + ' has a known guarded route: ' + service.cta.href);
  }
});

test('addresses are stable and the sitemap lists the list page and every service', () => {
  assert.equal(servicePath('pedigree'), '/services/pedigree');
  assert.equal(serviceBySlug('pedigree')?.titleFa, 'شجره‌نامه');
  assert.equal(serviceBySlug('no-such-service'), null);

  const paths = servicePaths();
  assert.equal(paths[0], '/services');
  assert.equal(paths.length, SERVICE_CATALOGUE.length + 1);
  assert.equal(new Set(paths).size, paths.length);
  assert.equal(accessForRoute('/services'), 'PUBLIC');
  assert.equal(accessForRoute('/services/pedigree'), 'PUBLIC');
});
