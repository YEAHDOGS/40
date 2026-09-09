import fs from 'fs';
import path from 'path';

const schemaPath = path.join(process.cwd(), 'src/graphql/generated.graphql');

if (fs.existsSync(schemaPath)) {
  let content = fs.readFileSync(schemaPath, 'utf8');
  
  // The generator outputs DateTime_NOT_SUPPORTED because it doesn't know about custom scalars.
  // We replace it with our own DateTime scalar which is defined in scalars.graphql.
  content = content.replace(/DateTime_NOT_SUPPORTED/g, 'DateTime');

  // passwordHash is a database-only column: the hash must never be
  // queryable over GraphQL (it would be an offline-cracking target).
  // Strip it from the generated type so future regenerations can't leak it.
  content = content.replace(/^\s*passwordHash: String\s*$/gm, '');
  
  fs.writeFileSync(schemaPath, content);
  console.log('Fixed custom scalars in generated.graphql');
}
