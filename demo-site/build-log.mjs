// A long build log for site A, made here and not kept as a file: several thousand lines in five
// steps, with a few errors and their stack traces at known places, a table and a code block.
// It is a test fixture for reading the relevant parts of a large page.

const STEPS = ['checkout', 'compile', 'unit tests', 'integration tests', 'package'];
const LINES_PER_STEP = 800;

/** The errors in the log: the step they are in, the line of that step, and what the line says. */
export const BUILD_LOG_ERRORS = [
  { step: 3, line: 412, message: 'ERROR OrderServiceTest.refundsAnOrder failed: expected status 200 but was 500', method: 'refund' },
  { step: 4, line: 150, message: 'ERROR CheckoutFlowIT.paysWithVoucher failed: timeout after 30000 ms waiting for the receipt', method: 'redeem' },
  { step: 4, line: 633, message: 'ERROR InventorySyncIT.reservesStock failed: connection refused by inventory-db:5432', method: 'reserve' },
];

/** The four lines of a stack trace under an error line. */
export function traceOf(error) {
  return [
    `    at shop.orders.OrderService.${error.method}(OrderService.java:${80 + error.line % 40})`,
    `    at shop.orders.OrderController.handle(OrderController.java:${40 + error.step})`,
    '    at shop.web.Dispatcher.dispatch(Dispatcher.java:211)',
    '    at shop.web.Server.run(Server.java:77)',
  ];
}

const pad = (n, width = 2) => String(n).padStart(width, '0');

/** The lines of one step. Every line differs from the one before it. */
function stepLines(step) {
  const name = STEPS[step - 1];
  const lines = [];
  const errors = BUILD_LOG_ERRORS.filter((e) => e.step === step);
  for (let i = 1; lines.length < LINES_PER_STEP; i++) {
    const second = (step - 1) * 900 + i;
    const time = `${pad(10 + Math.floor(second / 3600))}:${pad(Math.floor(second / 60) % 60)}:${pad(second % 60)}.${pad((i * 37) % 1000, 3)}`;
    const error = errors.find((e) => e.line === lines.length + 1);
    if (error) {
      lines.push(`${time} ${error.message}`, ...traceOf(error));
      continue;
    }
    lines.push(`${time} INFO  [${name}] task ${pad(i, 4)} of module core-${pad((i * 7) % 97, 3)} finished in ${(i * 13) % 250} ms`);
  }
  return lines.slice(0, LINES_PER_STEP);
}

/** How many lines of log the page holds. */
export const BUILD_LOG_LINES = STEPS.length * LINES_PER_STEP;

export function buildLogPage() {
  const sections = STEPS.map((name, index) => {
    const rows = stepLines(index + 1).map((line) => `<div>${line}</div>`).join('\n');
    return `<h2>Step ${index + 1}: ${name}</h2>\n<div class="log">\n${rows}\n</div>`;
  }).join('\n');
  const summary = STEPS.map((name, index) => {
    const failed = BUILD_LOG_ERRORS.filter((e) => e.step === index + 1).length;
    return `<tr><td>${name}</td><td>${failed ? `${failed} failed` : 'passed'}</td><td>${index * 3 + 2} min</td></tr>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Demo Tracker: Build 418</title>
  <style>
    body { font: 15px/1.5 system-ui, sans-serif; max-width: 960px; margin: 24px auto; padding: 0 16px; }
    table { border-collapse: collapse; }
    td, th { border: 1px solid #c8d0d8; padding: 4px 10px; }
    .log { font: 12px/1.4 ui-monospace, monospace; white-space: pre-wrap; background: #f4f6f8; padding: 8px; }
  </style>
</head>
<body>
  <nav><a href="/">Back to issues</a></nav>
  <h1>Build 418</h1>
  <h2>Summary</h2>
  <table>
    <caption>Steps of build 418</caption>
    <tr><th>Step</th><th>Result</th><th>Duration</th></tr>
${summary}
  </table>
  <h2>Reproduce</h2>
<pre>git checkout 4f2a9c1
./build.sh --step "integration tests" --verbose</pre>
  <!-- Never shown, so never read and never found. -->
  <div hidden>ERROR HIDDEN-LOG-SECRET in a hidden line</div>
${sections}
</body>
</html>
`;
}
