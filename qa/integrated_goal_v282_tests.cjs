'use strict';

const assert=require('assert');
const P=require('../integrated-goal-policy-v282.js');

assert.strictEqual(P.VERSION,'2.8.2');
assert.strictEqual(P.clampMobileMinutes(30),20);
assert.strictEqual(P.clampMobileMinutes(20),20);
assert.strictEqual(P.clampMobileMinutes(7),7);
assert.strictEqual(P.clampMobileMinutes(0),20);

assert.strictEqual(P.inferLearningUnit('完整 TOEIC-style 模考',{}),'mock');
assert.strictEqual(P.inferLearningUnit('短時間複習',{}),'review');
assert.strictEqual(P.inferLearningUnit('Part 7 訓練',{}),'practice');
assert.strictEqual(P.inferLearningUnit('News lesson',{articleId:'a1',articlesCompleted:1}),'article');
assert.strictEqual(P.inferLearningUnit('anything',{learningUnit:'review'}),'review');

const ev=P.makeReviewEvent({
  startedAt:'2026-10-04T00:00:00.000Z',
  endedAt:'2026-10-04T00:00:12.000Z',
  durationSeconds:12
});
assert.strictEqual(ev.learningUnit,'review');
assert.strictEqual(ev.durationMinutes,.2);
assert.strictEqual(ev.activity,'toeic-review-training');

console.log('INTEGRATED_GOAL_V282_TESTS_PASS');
