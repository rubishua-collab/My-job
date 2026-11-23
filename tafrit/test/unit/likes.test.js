import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { likeNames, suggestLikes, likeKey } from '../../shared/likes.js';
import { COMPONENTS } from '../../shared/catalog.js';

const foods = JSON.parse(fs.readFileSync(new URL('../../data/foods.json', import.meta.url), 'utf8')).foods;
const CHIPS = ['עוף', 'ביצים', 'קוטג׳', 'טונה', 'עדשים וקטניות', 'לחם'];
const L = likeNames({ chips: CHIPS, components: Object.values(COMPONENTS).map(c => c.name), foods });
const names = q => suggestLikes(L, q).map(x => x.name);

test('השלמה אוטומטית: "חמ" → חמאה ראשונה, "ע" → עוף ועגבנייה, כתיב חסר/מלא', () => {
  assert.equal(names('חמ')[0], 'חמאה');
  assert.ok(names('ע').includes('עוף') && names('ע').includes('עגבנייה'));
  assert.equal(names('ע')[0], 'עוף', 'כפתור קיים קודם');
  assert.deepEqual(names('עגבניה'), ['עגבנייה']);
  assert.deepEqual(names('עגבנייה'), ['עגבנייה']);
  assert.equal(likeKey('עגבנייה'), likeKey('עגבניה'));
  assert.ok(names('ח').length > 0, 'כבר מהאות הראשונה');
  assert.deepEqual(names(''), []);
  assert.ok(L.every(x => !/[()]/.test(x.name) && x.name.length <= 24), 'שמות קצרים ונקיים');
});
