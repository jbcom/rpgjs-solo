import { cleanAllDistDirectories } from './common';
import { packages } from './config';

/**
 * Clean script for manually removing all dist directories
 * 
 * This script provides a way to clean all build outputs without
 * running a full build process. Useful for troubleshooting
 * and ensuring a completely clean state.
 */
async function main() {
    console.log('🧹 Manual clean process started...');
    
    try {
        const allPackages = packages('build'); // Use build config as reference
        await cleanAllDistDirectories(allPackages);
        console.log('✅ Clean process completed successfully');
    } catch (error) {
        console.error('❌ Clean process failed:', error);
        process.exit(1);
    }
}

main().catch(error => {
    console.error('❌ Unexpected error during clean process:', error);
    process.exit(1);
}); 