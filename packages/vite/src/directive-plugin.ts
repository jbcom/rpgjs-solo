import { Plugin } from 'vite';
import MagicString from 'magic-string';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

export interface DirectivePluginOptions {
    side: 'client' | 'server';
}

function removeNode(s: MagicString, start: number, end: number) {
    s.remove(start, end);
}

function isDirective(node: any): node is any {
    return node.type === 'ExpressionStatement' &&
        node.expression.type === 'Literal' &&
        (node.expression.value === 'use client' || node.expression.value === 'use server');
}

export function directivePlugin(options: DirectivePluginOptions): Plugin {
    return {
        name: 'rpgjs-directive',
        transform(code, id) {
            const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' }) as any;
            const s = new MagicString(code);

            let fileDirective: 'client' | 'server' | null = null;
            if (ast.body.length && isDirective(ast.body[0])) {
                fileDirective = (ast.body[0].expression.value as string).split(' ')[1] as 'client' | 'server';
                if (fileDirective !== options.side) {
                    return {
                        code: 'export default null;',
                        map: { mappings: '' }
                    };
                }
                removeNode(s, ast.body[0].start, ast.body[0].end);
            }

            walk.ancestor(ast, {
                FunctionDeclaration(node: any, ancestors: any[]) {
                    if (node.body && node.body.body && node.body.body.length && isDirective(node.body.body[0])) {
                        const directive = (node.body.body[0].expression.value as string).split(' ')[1] as 'client' | 'server';
                        if (directive !== options.side) {
                            removeNode(s, node.start, node.end);
                        } else {
                            removeNode(s, node.body.body[0].start, node.body.body[0].end);
                        }
                    }
                },
                FunctionExpression(node: any, ancestors: any[]) {
                    if (node.body && node.body.body && node.body.body.length && isDirective(node.body.body[0])) {
                        const directive = (node.body.body[0].expression.value as string).split(' ')[1] as 'client' | 'server';
                        if (directive !== options.side) {
                            removeNode(s, node.start, node.end);
                        } else {
                            removeNode(s, node.body.body[0].start, node.body.body[0].end);
                        }
                    }
                },
                ArrowFunctionExpression(node: any, ancestors: any[]) {
                    if (node.body && node.body.body && node.body.body.length && isDirective(node.body.body[0])) {
                        const directive = (node.body.body[0].expression.value as string).split(' ')[1] as 'client' | 'server';
                        if (directive !== options.side) {
                            const decl = ancestors.slice().reverse().find((n: any) => n.type === 'VariableDeclaration');
                            if (decl) {
                                removeNode(s, decl.start, decl.end);
                            } else {
                                removeNode(s, node.start, node.end);
                            }
                        } else {
                            removeNode(s, node.body.body[0].start, node.body.body[0].end);
                        }
                    }
                }
            });

            return { code: s.toString(), map: s.generateMap({ hires: true }) };
        }
    };
}
