import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { entryPointPlugin } from '../src/entry-point-plugin';

describe('entryPointPlugin', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.RPG_TYPE;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.RPG_TYPE = originalEnv;
    } else {
      delete process.env.RPG_TYPE;
    }
  });

  it('should replace script tag with rpg entry point when RPG_TYPE is rpg', () => {
    process.env.RPG_TYPE = 'rpg';
    
    const plugin = entryPointPlugin();
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <script type="module" src="./src/client.ts"></script>
        </head>
        <body></body>
      </html>
    `;

    const transform = plugin.transformIndexHtml as any;
    const result = transform.handler(html);

    expect(result).toContain('<script type="module" src="./src/standalone.ts"></script>');
    expect(result).not.toContain('./src/client.ts');
  });

  it('should replace script tag with mmorpg entry point when RPG_TYPE is mmorpg', () => {
    process.env.RPG_TYPE = 'mmorpg';
    
    const plugin = entryPointPlugin();
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <script type="module" src="./src/standalone.ts"></script>
        </head>
        <body></body>
      </html>
    `;

    const transform = plugin.transformIndexHtml as any;
    const result = transform.handler(html);

    expect(result).toContain('<script type="module" src="./src/client.ts"></script>');
    expect(result).not.toContain('./src/standalone.ts');
  });

  it('should use custom entry points when provided', () => {
    process.env.RPG_TYPE = 'rpg';
    
    const plugin = entryPointPlugin({
      entryPoints: {
        rpg: './src/custom-standalone.ts',
        mmorpg: './src/custom-client.ts'
      }
    });
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <script type="module" src="./src/client.ts"></script>
        </head>
        <body></body>
      </html>
    `;

    const transform = plugin.transformIndexHtml as any;
    const result = transform.handler(html);

    expect(result).toContain('<script type="module" src="./src/custom-standalone.ts"></script>');
  });

  it('should add script tag if none exists', () => {
    process.env.RPG_TYPE = 'rpg';
    
    const plugin = entryPointPlugin();
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test</title>
        </head>
        <body></body>
      </html>
    `;

    const transform = plugin.transformIndexHtml as any;
    const result = transform.handler(html);

    expect(result).toContain('<script type="module" src="./src/standalone.ts"></script>');
    expect(result).toContain('</head>');
  });

  it('should default to rpg when RPG_TYPE is not set', () => {
    delete process.env.RPG_TYPE;
    
    const plugin = entryPointPlugin();
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <script type="module" src="./src/client.ts"></script>
        </head>
        <body></body>
      </html>
    `;

    const transform = plugin.transformIndexHtml as any;
    const result = transform.handler(html);

    expect(result).toContain('<script type="module" src="./src/standalone.ts"></script>');
  });

  it('should handle unknown RPG_TYPE gracefully', () => {
    process.env.RPG_TYPE = 'unknown';
    
    const plugin = entryPointPlugin();
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <script type="module" src="./src/client.ts"></script>
        </head>
        <body></body>
      </html>
    `;

    const transform = plugin.transformIndexHtml as any;
    const result = transform.handler(html);

    // Should fallback to rpg entry point
    expect(result).toContain('<script type="module" src="./src/standalone.ts"></script>');
  });

  it('should handle multiple script tags', () => {
    process.env.RPG_TYPE = 'mmorpg';
    
    const plugin = entryPointPlugin();
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <script type="module" src="./src/client.ts"></script>
          <script type="module" src="./src/another.ts"></script>
        </head>
        <body></body>
      </html>
    `;

    const transform = plugin.transformIndexHtml as any;
    const result = transform.handler(html);

    // Both should be replaced
    expect(result).toContain('<script type="module" src="./src/client.ts"></script>');
    expect(result).not.toContain('./src/another.ts');
    expect((result.match(/<script type="module" src="\.\/src\/client\.ts"><\/script>/g) || []).length).toBe(2);
  });
}); 