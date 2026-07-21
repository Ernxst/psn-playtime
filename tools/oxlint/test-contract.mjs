const testNames = new Set(["it", "test"]);

function propertyName(node) {
  if (node?.type !== "MemberExpression") return undefined;
  if (node.computed && node.property?.type === "Literal") return node.property.value;
  return node.property?.name;
}

function isViCall(node, name) {
  return (
    node?.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === "vi" &&
    propertyName(node.callee) === name
  );
}

function moduleSource(node) {
  if (node?.type === "Literal") return node.value;
  if (node?.type === "ImportExpression" && node.source.type === "Literal") {
    return node.source.value;
  }
  return undefined;
}

function callName(node) {
  if (node?.type !== "CallExpression") return undefined;
  return node.callee.type === "Identifier" ? node.callee.name : propertyName(node.callee);
}

function nearestFunction(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (
      current.type === "ArrowFunctionExpression" ||
      current.type === "FunctionExpression" ||
      current.type === "FunctionDeclaration"
    ) {
      return current;
    }
  }
  return undefined;
}

function containingCall(fn) {
  const parent = fn?.parent;
  return parent?.type === "CallExpression" && parent.arguments.includes(fn) ? parent : undefined;
}

function isInsideTest(node) {
  for (let fn = nearestFunction(node); fn; fn = nearestFunction(fn)) {
    if (testNames.has(callName(containingCall(fn)))) return true;
  }
  return false;
}

function expectation(node) {
  if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression") return undefined;
  const expectCall = node.callee.object;
  if (expectCall?.type !== "CallExpression" || callName(expectCall) !== "expect") return undefined;
  return { value: expectCall.arguments[0], matcher: propertyName(node.callee) };
}

function rule(messages, create, schema = []) {
  return {
    meta: { type: "problem", schema, messages },
    create,
  };
}

const noWaitFor = rule(
  { forbidden: "waitFor hides the event that should make this test deterministic" },
  (context) => ({
    CallExpression(node) {
      if (callName(node) === "waitFor" && !isViCall(node, "waitFor")) {
        context.report({ node, messageId: "forbidden" });
      }
    },
  })
);

const noTestTimers = rule(
  {
    timer: "Use fake timers instead of {{name}} in tests",
    tick: "Do not use Promise.resolve() as a next-tick primitive",
  },
  (context) => ({
    CallExpression(node) {
      const name = callName(node);
      if (name === "setTimeout" || name === "setInterval") {
        context.report({ node, messageId: "timer", data: { name } });
      }
      if (
        node.parent?.type === "AwaitExpression" &&
        node.callee.type === "MemberExpression" &&
        node.callee.object.type === "Identifier" &&
        node.callee.object.name === "Promise" &&
        propertyName(node.callee) === "resolve" &&
        node.arguments.length === 0
      ) {
        context.report({ node, messageId: "tick" });
      }
    },
  })
);

const noBooleanExpect = rule(
  { direct: "Assert the values that produced this boolean expression" },
  (context) => ({
    CallExpression(node) {
      if (callName(node) !== "expect") return;
      const value = node.arguments[0];
      if (
        value?.type === "BinaryExpression" ||
        value?.type === "LogicalExpression" ||
        (value?.type === "UnaryExpression" && value.operator === "!")
      ) {
        context.report({ node: value, messageId: "direct" });
      }
    },
  })
);

const noFinally = rule({ cleanup: "Use onTestFinished for per-test cleanup" }, (context) => ({
  CallExpression(node) {
    if (propertyName(node.callee) === "finally") context.report({ node, messageId: "cleanup" });
  },
}));

const noControlFlow = rule(
  { branch: "Use separate or parameterised test cases instead of {{kind}}" },
  (context) => {
    const check = (node, kind) => {
      if (isInsideTest(node)) context.report({ node, messageId: "branch", data: { kind } });
    };
    const checkExpectationLoop = (node) => {
      if (isInsideTest(node) && context.sourceCode.getText(node).includes("expect(")) {
        context.report({ node, messageId: "branch", data: { kind: "a loop over assertions" } });
      }
    };
    return {
      IfStatement: (node) => check(node, "if"),
      TryStatement: (node) => check(node, "try/catch"),
      ForStatement: checkExpectationLoop,
      ForInStatement: checkExpectationLoop,
      ForOfStatement: checkExpectationLoop,
      CallExpression(node) {
        if (propertyName(node.callee) === "forEach") checkExpectationLoop(node);
      },
    };
  }
);

const noAssertionInCallback = rule(
  { assertion: "Run the callback, then assert on the spy after it returns" },
  (context) => ({
    CallExpression(node) {
      if (callName(node) !== "expect") return;
      for (let fn = nearestFunction(node); fn; fn = nearestFunction(fn)) {
        const owner = callName(containingCall(fn));
        if (owner === "act" || owner === "fn" || owner === "mockImplementation") {
          context.report({ node, messageId: "assertion" });
          return;
        }
      }
    },
  })
);

const noMockCalls = rule(
  { history: "Use call matchers instead of reading mock.calls" },
  (context) => ({
    MemberExpression(node) {
      if (propertyName(node) !== "calls") return;
      if (propertyName(node.object) === "mock") context.report({ node, messageId: "history" });
    },
  })
);

const noInexactCardinality = rule(
  { count: "Assert exact cardinality only when it is required behaviour" },
  (context) => ({
    CallExpression(node) {
      const current = expectation(node);
      if (!current || !["length", "size"].includes(propertyName(current.value))) return;
      if (current.matcher?.startsWith("toBeGreaterThan")) {
        context.report({ node, messageId: "count" });
      }
    },
  })
);

const noBroadDomText = rule(
  { text: "Query the visible element and assert its exact accessible text" },
  (context) => ({
    CallExpression(node) {
      const current = expectation(node);
      if (!current || current.matcher !== "toContain") return;
      if (["textContent", "innerText"].includes(propertyName(current.value))) {
        context.report({ node, messageId: "text" });
      }
    },
  })
);

const domTraversalProperties = new Set([
  "childNodes",
  "children",
  "firstChild",
  "firstElementChild",
  "lastChild",
  "lastElementChild",
  "nextElementSibling",
  "nextSibling",
  "parentElement",
  "parentNode",
  "previousElementSibling",
  "previousSibling",
]);

const noDomSelector = rule(
  {
    semantic:
      "Use a semantic test query; disable this rule only when DOM structure or geometry is the behaviour under test",
  },
  (context) => ({
    CallExpression(node) {
      const name = propertyName(node.callee);
      if (
        name === "querySelector" ||
        name === "querySelectorAll" ||
        name === "closest" ||
        name === "matches" ||
        name === "getElementById" ||
        name?.startsWith("getElementsBy")
      ) {
        context.report({ node, messageId: "semantic" });
      }
    },
    MemberExpression(node) {
      const name = propertyName(node);
      if (domTraversalProperties.has(name)) {
        context.report({ node, messageId: "semantic" });
      }
    },
  })
);

const noPromiseConstructor = rule(
  { deferred: "Use Promise.withResolvers() instead of new Promise() in tests" },
  (context) => ({
    NewExpression(node) {
      if (node.callee.type === "Identifier" && node.callee.name === "Promise") {
        context.report({ node, messageId: "deferred" });
      }
    },
  })
);

const noQueryNullAssertion = rule(
  {
    presence:
      "Use expect.element(locator).not.toBeInTheDocument() for retryable presence assertions",
  },
  (context) => ({
    CallExpression(node) {
      const current = expectation(node);
      if (
        current?.matcher === "toBeNull" &&
        current.value?.type === "CallExpression" &&
        propertyName(current.value.callee) === "query"
      ) {
        context.report({ node, messageId: "presence" });
      }
    },
  })
);

const optionalActions = new Set([
  "blur",
  "click",
  "dispatchEvent",
  "focus",
  "remove",
  "setAttribute",
  "submit",
]);

const noOptionalTestAction = rule(
  { action: "Do not make {{name}} optional; the test must fail if its action target is absent" },
  (context) => ({
    CallExpression(node) {
      const name = propertyName(node.callee);
      if (
        isInsideTest(node) &&
        name &&
        optionalActions.has(name) &&
        (node.optional || node.callee.optional)
      ) {
        context.report({ node, messageId: "action", data: { name } });
      }
    },
  })
);

const noInternalModuleMock = rule(
  { internal: "Mock the external SDK or network boundary, not repository module '{{source}}'" },
  (context) => {
    const allow = new Set(context.options[0]?.allow ?? []);
    return {
      CallExpression(node) {
        if (!isViCall(node, "mock")) return;
        const source = moduleSource(node.arguments[0]);
        if (typeof source !== "string" || allow.has(source)) return;
        if (source.startsWith("@/") || source.startsWith("./") || source.startsWith("../")) {
          context.report({ node, messageId: "internal", data: { source } });
        }
      },
    };
  },
  [
    {
      type: "object",
      properties: { allow: { type: "array", items: { type: "string" } } },
      additionalProperties: false,
    },
  ]
);

const noAmbiguousCalledWith = rule(
  { count: "Assert the call count and identify the expected call" },
  (context) => ({
    CallExpression(node) {
      const current = expectation(node);
      if (current?.matcher === "toHaveBeenCalledWith") {
        context.report({ node, messageId: "count" });
      }
    },
  })
);

const noCallbackCapture = rule(
  { capture: "Assert callback arguments with mock call matchers instead of capturing them" },
  (context) => ({
    AssignmentExpression(node) {
      for (let fn = nearestFunction(node); fn; fn = nearestFunction(fn)) {
        const owner = callName(containingCall(fn));
        if (
          owner === "fn" ||
          owner === "mockImplementation" ||
          owner === "mockImplementationOnce"
        ) {
          context.report({ node, messageId: "capture" });
          return;
        }
      }
    },
  })
);

function shortcutKind(fn) {
  const body = fn?.body;
  if (
    body?.type === "BlockStatement" &&
    body.body.length === 1 &&
    body.body[0].type === "ThrowStatement"
  ) {
    return "mockThrow";
  }
  const value = body?.type === "BlockStatement" ? body.body[0]?.argument : body;
  if (
    value?.type === "NewExpression" &&
    value.callee.type === "Identifier" &&
    value.callee.name === "Promise"
  ) {
    return "mockReturnValue";
  }
  if (
    value?.type === "CallExpression" &&
    value.callee.type === "MemberExpression" &&
    value.callee.object.type === "Identifier" &&
    value.callee.object.name === "Promise"
  ) {
    return "mockReturnValue";
  }
  return undefined;
}

const noMockImplementationShortcut = rule(
  { shorthand: "Use {{replacement}} instead of mockImplementation for this value" },
  (context) => ({
    CallExpression(node) {
      if (propertyName(node.callee) !== "mockImplementation") return;
      const replacement = shortcutKind(node.arguments[0]);
      if (replacement) context.report({ node, messageId: "shorthand", data: { replacement } });
    },
  })
);

const noGlobalMockCleanup = rule(
  { hook: "Call vi.{{name}} only inside afterEach or onTestFinished" },
  (context) => ({
    CallExpression(node) {
      const name = propertyName(node.callee);
      if (name !== "resetModules" && name !== "restoreAllMocks") return;
      if (!isViCall(node, name)) return;
      const owner = callName(containingCall(nearestFunction(node)));
      if (owner !== "afterEach" && owner !== "onTestFinished") {
        context.report({ node, messageId: "hook", data: { name } });
      }
    },
  })
);

export default {
  meta: { name: "test-contract" },
  rules: {
    "no-wait-for": noWaitFor,
    "no-test-timers": noTestTimers,
    "no-boolean-expect": noBooleanExpect,
    "no-finally": noFinally,
    "no-control-flow": noControlFlow,
    "no-assertion-in-callback": noAssertionInCallback,
    "no-mock-calls": noMockCalls,
    "no-inexact-cardinality": noInexactCardinality,
    "no-broad-dom-text": noBroadDomText,
    "no-dom-selector": noDomSelector,
    "no-promise-constructor": noPromiseConstructor,
    "no-query-null-assertion": noQueryNullAssertion,
    "no-optional-test-action": noOptionalTestAction,
    "no-internal-module-mock": noInternalModuleMock,
    "no-ambiguous-called-with": noAmbiguousCalledWith,
    "no-callback-capture": noCallbackCapture,
    "no-mock-implementation-shortcut": noMockImplementationShortcut,
    "no-global-mock-cleanup": noGlobalMockCleanup,
  },
};
