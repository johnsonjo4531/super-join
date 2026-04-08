/**
 * Super-join component example for Node.js
 * 
 * This demonstrates how to use the WASM component with Node.js using
 * @bytecodealliance/preview2-shim for WASI support.
 * 
 * First install the preview2-shim:
 *   npm install @bytecodealliance/preview2-shim
 * 
 * Then run:
 *   node src-js/__component__/node_example.js
 */

import { buf as initPreview2 } from '@bytecodealliance/preview2-shim';

// Initialize Preview2 shim to provide WASI implementations
initPreview2();

// Now import and instantiate the component
const { instantiate } = await import('./src-js/__component__/super_join.js');

// Example 1: Build a SQL query from GraphQL
async function exampleBuildSqlQuery() {
  console.log('\n=== Example 1: Build SQL Query ===');
  
  const { buildSqlQuery } = await instantiate();
  
  const graphqlQuery = `{
    users {
      id
      name
      posts {
        title
      }
    }
  }`;
  
  const metadata = JSON.stringify({
    tables: {
      users: {
        columns: ['id', 'name'],
        primary_key: 'id',
      },
      posts: {
        columns: ['id', 'title', 'user_id'],
        primary_key: 'id',
        foreign_keys: {
          user_id: {
            references: { table: 'users', column: 'id' },
          },
        },
      },
    },
  });
  
  try {
    const sql = buildSqlQuery(graphqlQuery, metadata, undefined);
    console.log('Generated SQL:', sql);
  } catch (error) {
    console.error('Error building SQL query:', error);
  }
}

// Example 2: Hydrate flat results into nested structure
async function exampleHydrateResults() {
  console.log('\n=== Example 2: Hydrate Results ===');
  
  const { hydrateResults } = await instantiate();
  
  const flatRows = JSON.stringify([
    {
      user_id: '1',
      user_name: 'Alice',
      post_id: '101',
      post_title: 'Hello World',
    },
    {
      user_id: '1',
      user_name: 'Alice',
      post_id: '102',
      post_title: 'Second Post',
    },
    {
      user_id: '2',
      user_name: 'Bob',
      post_id: null,
      post_title: null,
    },
  ]);
  
  const metadata = JSON.stringify({
    fields: [
      { name: 'id', path: 'user_id' },
      { name: 'name', path: 'user_name' },
      { name: 'posts', path: 'post', children: [
        { name: 'id', path: 'post_id' },
        { name: 'title', path: 'post_title' },
      ]},
    ],
  });
  
  try {
    const hydrated = hydrateResults(flatRows, metadata);
    console.log('Hydrated results:', JSON.stringify(JSON.parse(hydrated), null, 2));
  } catch (error) {
    console.error('Error hydrating results:', error);
  }
}

// Run examples
async function main() {
  console.log('Super-join Component Examples for Node.js');
  console.log('===========================================');
  
  await exampleBuildSqlQuery();
  await exampleHydrateResults();
  
  console.log('\nDone!');
}

main().catch(console.error);
