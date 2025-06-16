import { buildSequentially, buildInParallel } from './common';
import process from 'process';
import { packages } from './config';

/**
 * Main development function
 * 
 * This function starts all packages in watch mode simultaneously,
 * allowing for real-time development with automatic rebuilds.
 * Unlike the build script, this runs all packages in parallel
 * since watch mode processes need to run indefinitely.
 * 
 * @example
 * ```bash
 * npm run dev
 * ```
 */
async function main() {
    console.log('🚀 Starting development mode with watch...');
    await buildInParallel(packages('dev'));
}

main().catch(error => {
    console.error('❌ Development process error:', error);
    process.exit(1);
}); 