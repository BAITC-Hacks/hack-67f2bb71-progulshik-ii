import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const COLLECTIONS = new Set(['tasks', 'teams', 'proposals']);

/** A small synchronous JSON store. Each write is durable; transactions are atomic. */
export function createStore(path = ':memory:') {
  if (typeof path !== 'string' || !path.trim()) {
    throw new TypeError('Database path must be a nonempty string');
  }
  const databasePath = path === ':memory:' ? path : resolve(path);
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });

  const database = new DatabaseSync(databasePath);
  let listRecords;
  let getRecord;
  let putRecord;
  try {
    database.exec('PRAGMA busy_timeout = 5000');
    if (databasePath !== ':memory:') database.exec('PRAGMA journal_mode = WAL');
    database.exec(`
      CREATE TABLE IF NOT EXISTS app_records (
        collection TEXT NOT NULL CHECK (collection IN ('tasks', 'teams', 'proposals')),
        id TEXT NOT NULL,
        payload TEXT NOT NULL CHECK (json_valid(payload)),
        PRIMARY KEY (collection, id)
      )
    `);
    listRecords = database.prepare('SELECT payload FROM app_records WHERE collection = ? ORDER BY rowid');
    getRecord = database.prepare('SELECT payload FROM app_records WHERE collection = ? AND id = ?');
    putRecord = database.prepare(`
      INSERT INTO app_records (collection, id, payload) VALUES (?, ?, ?)
      ON CONFLICT (collection, id) DO UPDATE SET payload = excluded.payload
    `);
  } catch (error) {
    // Surface corrupt or incompatible databases; never remove or replace them.
    database.close();
    throw error;
  }

  let closed = false;
  let transactionDepth = 0;
  let savepointNumber = 0;

  function assertOpen() {
    if (closed) throw new Error('Database is closed');
  }

  function assertCollection(collection) {
    assertOpen();
    if (!COLLECTIONS.has(collection)) throw new TypeError(`Unknown collection: ${String(collection)}`);
  }

  function assertId(id) {
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('Record id must be a nonempty string');
  }

  const store = {
    list(collection) {
      assertCollection(collection);
      return listRecords.all(collection).map((row) => JSON.parse(row.payload));
    },

    get(collection, id) {
      assertCollection(collection);
      assertId(id);
      const row = getRecord.get(collection, id);
      return row ? JSON.parse(row.payload) : undefined;
    },

    put(collection, record) {
      assertCollection(collection);
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        throw new TypeError('Record must be a JSON object');
      }
      assertId(record.id);
      const payload = JSON.stringify(record);
      const saved = JSON.parse(payload);
      if (!saved || typeof saved !== 'object' || Array.isArray(saved) || saved.id !== record.id) {
        throw new TypeError('Serialized record must preserve its id');
      }
      putRecord.run(collection, record.id, payload);
      return saved;
    },

    transaction(fn) {
      assertOpen();
      if (typeof fn !== 'function') throw new TypeError('Transaction requires a function');
      if (fn.constructor?.name === 'AsyncFunction') {
        throw new TypeError('Transactions require synchronous callbacks');
      }
      const savepoint = transactionDepth > 0 ? `store_savepoint_${++savepointNumber}` : null;
      database.exec(savepoint ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE');
      transactionDepth += 1;
      try {
        const result = fn(store);
        if (result && typeof result.then === 'function') {
          throw new TypeError('Transactions require synchronous callbacks');
        }
        database.exec(savepoint ? `RELEASE SAVEPOINT ${savepoint}` : 'COMMIT');
        return result;
      } catch (error) {
        if (savepoint) {
          database.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          database.exec(`RELEASE SAVEPOINT ${savepoint}`);
        } else {
          database.exec('ROLLBACK');
        }
        throw error;
      } finally {
        transactionDepth -= 1;
      }
    },

    close() {
      if (closed) return;
      if (transactionDepth) throw new Error('Cannot close database inside a transaction');
      database.close();
      closed = true;
    },
  };

  return Object.freeze(store);
}
