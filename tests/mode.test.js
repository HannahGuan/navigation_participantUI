import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveMode} from '../docs/mode.js';
test('bare URL uploads in researcher mode; only explicit preview disables uploading',()=>{
 assert.equal(resolveMode(new URLSearchParams()),'researcher');
 assert.equal(resolveMode(new URLSearchParams('preview=1')),'preview');
 assert.equal(resolveMode(new URLSearchParams('PROLIFIC_PID=p&STUDY_ID=s&SESSION_ID=x')),'participant');
 assert.equal(resolveMode(new URLSearchParams('mode=researcher&condition=1')),'researcher');
});
test('broken or unexpanded Prolific URLs never silently become researcher tests',()=>{
 assert.throws(()=>resolveMode(new URLSearchParams('PROLIFIC_PID=p')));
 assert.throws(()=>resolveMode(new URLSearchParams('PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID=s&SESSION_ID=x')));
});
