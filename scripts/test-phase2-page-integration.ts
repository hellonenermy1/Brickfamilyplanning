import {parentV8Html} from '../src/parent-v8';
import {parentP8BHtml} from '../src/parent-p8b';
import {parentBetaHtml} from '../src/parent-beta';
const html=parentBetaHtml(parentP8BHtml(parentV8Html()));
if(!html.includes('data-tab="logs"')||!html.includes('BETA · Test centre'))throw Error('Phase 2 portal composition incomplete');
if(!html.includes("async function loadEvents(){const requestDevice=currentDevice;"))throw Error('Safety Event device boundary not installed');
if(!html.includes("async function p7LoadLocationControl(){const requestDevice=currentDevice;"))throw Error('GPS response boundary not installed');
console.log('PASS Phase2 composite portal HTML, safety events and GPS guard: '+html.length+' bytes');
