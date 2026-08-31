// The example database: an in-memory SQLite database via the built-in
// `node:sqlite` module. No external services or native builds — the whole
// example runs with just Node.js. Swap this file for a real driver (postgres,
// mysql, ...) and keep everything else identical; super-join never touches the
// database itself.

import { DatabaseSync } from 'node:sqlite';
import type { Parameter } from 'super-join';

export function openDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE posts (id INTEGER PRIMARY KEY, author_id INTEGER NOT NULL, views INTEGER NOT NULL);
    INSERT INTO users (id, name) VALUES (1, 'ada'), (2, 'grace'), (3, 'linus');
    INSERT INTO posts (id, author_id, views) VALUES
      (101, 1, 5),
      (102, 1, 9),
      (103, 2, 7),
      (104, 3, 3);
  `);
  return db;
}

/**
 * Unwraps the artifact's tagged parameters into plain values a driver accepts.
 * SQLite has no boolean type, so booleans become 1/0 here.
 */
export function toDriverValue(parameter: Parameter): null | number | bigint | string | Uint8Array {
  const value = parameter.value;
  switch (value.tag) {
    case 'null':
      return null;
    case 'boolean':
      return value.val ? 1 : 0;
    case 'integer':
      return value.val; // bigint — node:sqlite binds it directly
    case 'float':
      return value.val;
    case 'text':
      return value.val;
    case 'binary':
      return value.val;
    default:
      throw new Error(`unknown parameter tag "${(value as { tag: string }).tag}"`);
  }
}
