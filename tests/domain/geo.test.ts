/**
 * Geography, local pages and the map — Phase 2 PROMPT-015.
 *
 * The pure half of §2, §19 and §20: how a city becomes a stable address, when a
 * local page is worth offering to a search engine, and when a place may be
 * drawn at all. The privacy rule is tested first because it outranks the rest.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  citySlug,
  isIndexablePlace,
  mapEmbedUrl,
  mapState,
  placePath,
  placeTotal,
  publicAddress,
  publicCoordinates,
} from '../../src/geo/model.ts';

const ZWNJ = String.fromCharCode(0x200c);

test('a city address comes from its Persian name, with word breaks as hyphens', () => {
  assert.equal(citySlug('تهران'), 'تهران');
  assert.equal(citySlug('بندر عباس'), 'بندر-عباس');
  assert.equal(citySlug('  شهرکرد '), 'شهرکرد');
  assert.equal(citySlug('علی' + ZWNJ + 'آباد'), 'علی-آباد');
  // Punctuation never reaches a permanent address.
  assert.equal(citySlug('قم/جدید'), 'قمجدید');
  assert.equal(citySlug(''), '');

  assert.equal(placePath('tehran'), '/places/tehran');
  assert.equal(placePath('tehran', 'تهران'), '/places/tehran/تهران');
});

test('a place with nothing published in it is not offered to search engines', () => {
  const empty = { vets: 0, centres: 0, communities: 0 };
  assert.equal(placeTotal(empty), 0);
  assert.equal(isIndexablePlace(empty), false);
  // One published record of any kind is enough to make the page worth having.
  assert.equal(isIndexablePlace({ ...empty, vets: 1 }), true);
  assert.equal(isIndexablePlace({ ...empty, centres: 2 }), true);
  assert.equal(isIndexablePlace({ ...empty, communities: 1 }), true);
  assert.equal(placeTotal({ vets: 1, centres: 2, communities: 3 }), 6);
});

test('a location its owner did not publish is never drawn, whatever else is configured', () => {
  const configured = { providerConfigured: true, latitude: 35.7, longitude: 51.4 };
  assert.equal(mapState({ ...configured, isPublic: false }), 'NOT_PUBLIC');
  // Not public outranks everything: coordinates are not even considered.
  assert.equal(mapState({ providerConfigured: true, isPublic: false, latitude: null, longitude: null }), 'NOT_PUBLIC');

  assert.equal(mapState({ ...configured, isPublic: true }), 'VISIBLE');
  assert.equal(mapState({ ...configured, providerConfigured: false, isPublic: true }), 'NO_PROVIDER');
  assert.equal(mapState({ providerConfigured: true, isPublic: true, latitude: null, longitude: 51.4 }), 'NO_COORDINATES');
  assert.equal(mapState({ providerConfigured: true, isPublic: true, latitude: 35.7, longitude: null }), 'NO_COORDINATES');
});

test('the map address is filled from the operator’s template and never guessed', () => {
  const template = 'https://maps.example/embed?lat={lat}&lng={lng}&key={key}';
  assert.equal(
    mapEmbedUrl(template, { latitude: 35.7, longitude: 51.4, apiKey: 'k 1' }),
    'https://maps.example/embed?lat=35.7&lng=51.4&key=k%201',
  );
  // A template that does not place the coordinates would draw somewhere else.
  assert.equal(mapEmbedUrl('https://maps.example/embed?key={key}', { latitude: 35.7, longitude: 51.4, apiKey: 'k' }), null);
  assert.equal(mapEmbedUrl('https://maps.example/embed?lat={lat}', { latitude: 35.7, longitude: 51.4, apiKey: 'k' }), null);
  // Only https, and nothing at all without a template.
  assert.equal(mapEmbedUrl('http://maps.example/{lat}/{lng}', { latitude: 1, longitude: 2, apiKey: null }), null);
  assert.equal(mapEmbedUrl('', { latitude: 1, longitude: 2, apiKey: null }), null);
  // A missing key is substituted as empty rather than left as a placeholder.
  assert.equal(
    mapEmbedUrl('https://maps.example/{lat},{lng}?k={key}', { latitude: 1, longitude: 2, apiKey: null }),
    'https://maps.example/1,2?k=',
  );
});

test('a private address and a private position never leave the record', () => {
  assert.equal(publicAddress({ isPublic: false, addressFa: 'خیابان نمونه، پلاک ۱' }), null);
  assert.equal(publicAddress({ isPublic: true, addressFa: '  ' }), null);
  assert.equal(publicAddress({ isPublic: true, addressFa: 'خیابان نمونه' }), 'خیابان نمونه');

  assert.equal(publicCoordinates({ isPublic: false, latitude: 35.7, longitude: 51.4 }), null);
  assert.equal(publicCoordinates({ isPublic: true, latitude: null, longitude: 51.4 }), null);
  assert.deepEqual(publicCoordinates({ isPublic: true, latitude: 35.6892123456, longitude: 51.3890987654 }), {
    latitude: 35.68921,
    longitude: 51.3891,
  });
});
