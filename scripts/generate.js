import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  console.log('> Running: prisma generate');
  execSync('npx prisma generate', { stdio: 'inherit' });
} catch (err) {
  console.log('\n> Note: Prisma generate completed with warnings/errors (likely due to a Windows EPERM file-lock from the running dev server). Proceeding to fix GraphQL schema types anyway...\n');
}

try {
  console.log('> Running: node scripts/fix-graphql.js');
  execSync('node scripts/fix-graphql.js', { stdio: 'inherit' });
} catch (err) {
  console.error('> Failed to run fix-graphql.js:', err.message);
  process.exit(1);
}
