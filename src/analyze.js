import { parse } from '@babel/parser';
import { createHash } from 'node:crypto';

const functionTypes = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod', 'ClassPrivateMethod']);
const ignored = new Set(['loc', 'start', 'end', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments', 'tokens', 'errors']);
export const hash = text => createHash('sha256').update(text).digest('hex');

function children(node) {
  return Object.entries(node).filter(([key]) => !ignored.has(key)).flatMap(([, value]) =>
    Array.isArray(value) ? value.filter(x => x?.type) : value?.type ? [value] : []);
}
function walk(node, visit, parent = null) {
  if (!node?.type) return;
  visit(node, parent);
  for (const child of children(node)) walk(child, visit, node);
}
function symbol(node, source) {
  if (!node) return '?';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
    if (node.computed && node.property.type !== 'StringLiteral') return '?dynamic';
    return `${symbol(node.object, source)}.${node.property.name ?? node.property.value}`;
  }
  return source.slice(node.start, node.end);
}
function nameOf(node, parent, source) {
  return node.id?.name ?? node.key?.name ?? node.key?.value ??
    (parent?.type === 'VariableDeclarator' ? symbol(parent.id, source) : null) ??
    (parent?.type === 'AssignmentExpression' ? symbol(parent.left, source) : null) ?? `anonymous@${node.loc.start.line}`;
}
function normalize(node) {
  // An AST view, not regex replacement: literal strings, operators and await survive.
  const names = new Map();
  const tokens = [];
  walk(node, (n, parent) => {
    tokens.push(n.type);
    if (n.type === 'Identifier') {
      if ((parent?.type === 'MemberExpression' || parent?.type === 'OptionalMemberExpression') && parent.property === n && !parent.computed) {
        tokens.push(`property:${n.name}`);
        return;
      }
      if (!names.has(n.name)) names.set(n.name, `id${names.size}`);
      tokens.push(names.get(n.name));
    }
    if (n.operator) tokens.push(n.operator);
    if (n.value !== undefined && !n.type.startsWith('JSX')) tokens.push(JSON.stringify(n.value));
    if (n.async) tokens.push('async');
    if (n.computed) tokens.push('computed');
  });
  return tokens.join(' ');
}
function containsUnsupported(node) {
  let unknown = false;
  walk(node, n => {
    if (['ForStatement', 'WhileStatement', 'DoWhileStatement', 'ForOfStatement', 'ForInStatement', 'SwitchStatement', 'TryStatement', 'ConditionalExpression', 'LogicalExpression', 'ThrowStatement', 'BreakStatement', 'ContinueStatement'].includes(n.type)) unknown = true;
  });
  return unknown;
}
function factsFor(fn, source) {
  const calls = [], guards = [];
  let uncertain = false;
  const bindings = new Map(), awaitedBindings = new Set();
  function scan(node) {
    if (node !== fn && functionTypes.has(node.type)) return;
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init?.type === 'CallExpression') bindings.set(node.id.name, node.init.start);
    if (node.type === 'AwaitExpression' && node.argument.type === 'Identifier') awaitedBindings.add(node.argument.name);
    for (const child of children(node)) scan(child);
  }
  scan(fn);
  const delayedAwaits = new Set([...awaitedBindings].map(name => bindings.get(name)));
  // Branch labels prevent mutually exclusive calls from becoming a fabricated path.
  const visit = (node, context = { branches: [], guards: [], awaited: false, uncertain: false }) => {
    if (!node?.type) return;
    if (node !== fn && functionTypes.has(node.type)) return;
    if (node.type === 'IfStatement') {
      const condition = source.slice(node.test.start, node.test.end);
      guards.push({ condition, line: node.test.loc.start.line });
      visit(node.test, context);
      visit(node.consequent, { ...context, guards: [...context.guards, condition], branches: [...context.branches, `${node.start}:then`] });
      if (node.alternate) visit(node.alternate, { ...context, guards: [...context.guards, `!(${condition})`], branches: [...context.branches, `${node.start}:else`] });
      return;
    }
    const complex = ['ForStatement', 'WhileStatement', 'DoWhileStatement', 'ForOfStatement', 'ForInStatement', 'SwitchStatement', 'TryStatement', 'ConditionalExpression', 'LogicalExpression', 'ThrowStatement', 'BreakStatement', 'ContinueStatement'].includes(node.type);
    if (complex) uncertain = true;
    if (node.type === 'AwaitExpression') {
      visit(node.argument, { ...context, awaited: true });
      return;
    }
    if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
      // Arguments execute before the enclosing invocation. Await belongs only to
      // the outer invocation, not calls made while evaluating its arguments.
      for (const arg of node.arguments) visit(arg, { ...context, awaited: false, uncertain: context.uncertain || (context.awaited && ['Promise.all', 'Promise.allSettled', 'Promise.race', 'Promise.any'].includes(symbol(node.callee, source))) });
      const target = symbol(node.callee, source);
      const dynamic = target.includes('?') || ['OptionalCallExpression', 'OptionalMemberExpression'].includes(node.type) || node.callee.type === 'OptionalMemberExpression';
      uncertain ||= dynamic;
      calls.push({ target, line: node.loc.start.line, start: node.start, end: node.end, awaited: context.awaited,
        guards: context.guards, branches: context.branches, uncertain: context.uncertain || complex || dynamic || delayedAwaits.has(node.start),
        arguments: node.arguments.filter(a => a.type === 'StringLiteral').map(a => a.value) });
      // Callee expressions can themselves contain calls, which need richer analysis.
      if (node.callee.type === 'CallExpression' || (node.callee.object?.type === 'CallExpression')) uncertain = true;
      return;
    }
    for (const child of children(node)) visit(child, { ...context, uncertain: context.uncertain || complex });
  };
  visit(fn);
  // Early returns / branching need CFG analysis; order certificates are restricted.
  const linear = fn.body.type === 'BlockStatement' && fn.body.body.every((stmt, i, all) =>
    !containsUnsupported(stmt) && stmt.type !== 'IfStatement' &&
    (stmt.type !== 'ReturnStatement' || i === all.length - 1));
  return { calls, guards, linear, uncertain };
}

export function analyzeFile(source, file = 'snippet.js') {
  let ast;
  try {
    ast = parse(source, { sourceType: 'unambiguous', plugins: ['jsx'], allowReturnOutsideFunction: true });
  } catch (error) {
    return { snippets: [], diagnostics: [{ file, line: error.loc?.line ?? 1, message: error.message }] };
  }
  const snippets = [];
  walk(ast, (node, parent) => {
    if (!functionTypes.has(node.type)) return;
    const code = source.slice(node.start, node.end), normalized = normalize(node);
    const facts = factsFor(node, source);
    const name = nameOf(node, parent, source);
    snippets.push({ name, file, startLine: node.loc.start.line, endLine: node.loc.end.line, code, normalized,
      contentHash: hash(code), shapeHash: hash(normalized), facts,
      behaviorText: [name, ...facts.calls.flatMap(c => [c.target, ...c.arguments, c.awaited ? `await waits completion ${c.target}` : `unawaited does not wait ${c.target}`, ...c.guards]), ...facts.guards.map(g => g.condition)].join(' ') });
  });
  return { snippets, diagnostics: [] };
}
