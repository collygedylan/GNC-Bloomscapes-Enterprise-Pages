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

window.GncWatchdogLocalDiagnostics = Object.freeze({isHandledWatchdogEvent, routeWatchdogCapture});
