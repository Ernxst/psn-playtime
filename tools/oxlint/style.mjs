const testDefinitions = new Set(["describe", "it", "suite", "test"]);

function rootCallName(node) {
  if (node?.type !== "CallExpression") return undefined;
  if (node.callee.type === "Identifier") return node.callee.name;
  if (node.callee.type === "CallExpression") return rootCallName(node.callee);
  if (node.callee.type === "MemberExpression") {
    const object = node.callee.object;
    return object.type === "Identifier" ? object.name : rootCallName(object);
  }
  return undefined;
}

function containingCall(fn) {
  const parent = fn.parent;
  return parent?.type === "CallExpression" && parent.arguments.includes(fn) ? parent : undefined;
}

function isViCall(node) {
  return (
    node?.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === "vi"
  );
}

function discardedExpression(sourceCode, expression) {
  const text = sourceCode.getText(expression);
  if (expression.operator === "void") return text;
  return expression.type === "SequenceExpression" ? `void (${text})` : `void ${text}`;
}

function requireBlock(context, node) {
  context.report({
    node: node.body,
    messageId: "test",
    fix: (fixer) => fixer.replaceText(node.body, `{ ${context.sourceCode.getText(node.body)}; }`),
  });
}

function isAssignmentBody(body) {
  return (
    body.type === "AssignmentExpression" ||
    (body.type === "UnaryExpression" && body.argument.type === "AssignmentExpression")
  );
}

const preferConciseArrow = {
  meta: {
    type: "suggestion",
    fixable: "code",
    schema: [],
    messages: {
      assignment: "Keep assignment arrow functions in a block body",
      concise: "Write a one-line expression arrow function without braces",
      test: "Keep test-definition callbacks in a block body",
    },
  },
  create: (context) => ({
    ArrowFunctionExpression(node) {
      const owner = rootCallName(containingCall(node));
      if (isAssignmentBody(node.body)) {
        context.report({ node: node.body, messageId: "assignment" });
        return;
      }
      if (
        owner === "onTestFinished" &&
        node.body.type !== "BlockStatement" &&
        isViCall(node.body)
      ) {
        context.report({
          node: node.body,
          messageId: "concise",
          fix: (fixer) =>
            fixer.replaceText(node.body, discardedExpression(context.sourceCode, node.body)),
        });
        return;
      }
      if (testDefinitions.has(owner)) {
        if (node.body.type !== "BlockStatement") requireBlock(context, node);
        return;
      }
      if (node.body.type !== "BlockStatement" || node.body.body.length !== 1) return;
      const [statement] = node.body.body;
      if (statement.type !== "ExpressionStatement") return;
      if (statement.expression.type === "AssignmentExpression") return;
      if (statement.loc.start.line !== statement.loc.end.line) return;

      context.report({
        node: node.body,
        messageId: "concise",
        fix: (fixer) =>
          fixer.replaceText(
            node.body,
            discardedExpression(context.sourceCode, statement.expression)
          ),
      });
    },
  }),
};

export default {
  meta: { name: "style" },
  rules: { "prefer-concise-arrow": preferConciseArrow },
};
