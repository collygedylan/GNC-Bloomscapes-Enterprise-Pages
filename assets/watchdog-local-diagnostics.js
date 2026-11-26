'use strict';
function isHandledWatchdogEvent(event) {
  return event.event_type === 'OPERATIONAL_FAILURE' && event.sub_module === 'handled-runtime';
}

function routeWatchdogCapture(context, error, operation, handledCodes, sourceLocation, captureOperation) {
  if (operation !== 'runtime-operation' || !handledCodes.has(error?.code)) {
    return captureOperation(context, error, operation);
  }
  const location = handledWatchdogSource(new Error().stack, sourceLocation);
  return context.record('OPERATIONAL_FAILURE', {
    severity: 'high', sub_module: 'handled-runtime',
    error_message: 'Handled runtime failure: ' + error.code + (location ? ' @ ' + location : ''),
    suspected_functions: location ? [location] : []
  });
}

function handledWatchdogSource(stack, sourceLocation) {
  for (const frame of String(stack || '').split('\n').slice(1, 12)) {
    const match = frame.match(/(https?:\/\/[^\s)]+):(\d+):(\d+)/);
    if (!match) continue;
    const source = sourceLocation(match[1], match[2], match[3]);
    if (source && !/^assets\/(?:runtime-watchdog|watchdog-local-diagnostics)\.js:/.test(source)) return source;
  }
  return '';
}

const watchdogErrorName = /^(?:Error|TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError|AggregateError|DOMException|SecurityError|QuotaExceededError|InvalidStateError|NetworkError|TimeoutError)$/;
const watchdogIdentifier = '[$\\p{ID_Start}][$\\u200c\\u200d\\p{ID_Continue}]{0,119}';
const watchdogReference = new RegExp("^(?:(?:Uncaught )?ReferenceError: )?(?:"+watchdogIdentifier
  +" is not defined|Cannot access '"+watchdogIdentifier+"' before initialization|Can't find variable: "+watchdogIdentifier+")$",'u');
const watchdogErrorCodes = [
  [/cannot (?:read|set) (?:properties|property) of (?:undefined|null)/i,'NULL_OR_UNDEFINED_PROPERTY'],
  [/is not defined/i,'NOT_DEFINED'],[/is not a function/i,'NOT_A_FUNCTION'],
  [/not (?:iterable|an object)/i,'INVALID_VALUE_TYPE'],[/maximum call stack|too much recursion/i,'STACK_OVERFLOW'],
  [/unexpected (?:token|identifier|end)/i,'SYNTAX_FAILURE'],[/script error/i,'SCRIPT_ERROR']
];
const watchdogAppFrame = /^(?:assets\/[a-z0-9_./-]+\.(?:m?js)|index\.html):\d{1,7}:\d{1,7}$/i;

function topWatchdogFrame(details,sourceLocation) {
  for (const line of String(details.runtime_stack || '').slice(0,3000).split('\n').slice(0,8)) {
    const match = line.match(/((?:https?:\/\/|\/|assets\/)[^\s)]+):(\d+):(\d+)/);
    const source = match && sourceLocation(match[1],match[2],match[3]);
    if (source) return source;
  }
  return sourceLocation(details.runtime_source,details.runtime_line,details.runtime_column);
}

function watchdogDiagnosticFields(message,frame) {
  return {error_message:message+(frame ? ' @ '+frame : ''),suspected_functions:frame ? [frame] : []};
}

function runtimeWatchdogDiagnostic(details,sourceLocation) {
  const message = String(details.error_message || '').slice(0,1000);
  const requestedName = String(details.runtime_error_name || message.match(/^(?:Uncaught )?([A-Za-z]+Error):/)?.[1] || 'Error');
  const name = watchdogErrorName.test(requestedName) ? requestedName : 'Error';
  const frame = topWatchdogFrame(details,sourceLocation);
  const safeReference = name === 'ReferenceError' && watchdogReference.test(message);
  const code = safeReference ? message.replace(/^(?:Uncaught )?ReferenceError: /,'')
    : watchdogErrorCodes.find(([pattern]) => pattern.test(message))?.[1] || 'UNHANDLED_ERROR';
  return watchdogDiagnosticFields(name+': '+code,frame);
}

function restoreWatchdogDiagnostic(event) {
  const [message,frame,...extra] = String(event.error_message || '').split(' @ ');
  if (extra.length || frame && !watchdogAppFrame.test(frame)) return null;
  const [name,code] = message.split(': ',2);
  if (watchdogReference.test(message) && name === 'ReferenceError') return watchdogDiagnosticFields(message,frame);
  const knownCode = code === 'UNHANDLED_ERROR' || watchdogErrorCodes.some(([,known]) => known === code);
  return knownCode && watchdogErrorName.test(name) && message === name+': '+code
    ? watchdogDiagnosticFields(message,frame) : null;
}

window.GncWatchdogLocalDiagnostics = Object.freeze({
  isHandledWatchdogEvent,routeWatchdogCapture,runtimeWatchdogDiagnostic,restoreWatchdogDiagnostic
});
