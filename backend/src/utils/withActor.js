import db from '../config/db.js';

// Session variables belong to a CONNECTION, and db.js is a mysql2 POOL. The status
// audit trigger (migration 015) reads the acting user from @civictrack_actor_id, so
// a bare `await db.query("SET ...")` followed by `await db.query("UPDATE ...")` can
// land on two different pooled connections: the UPDATE would run with the variable
// unset and status_history.changed_by would silently land as NULL.
//
// Every write that must be attributable therefore goes through here: one pinned
// connection, variable set, work, commit. `work` receives the connection so the
// caller cannot accidentally escape onto the pool mid-transaction and lose the
// variable — or read state this transaction has not committed.
export const withActor = async (actorId, work) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    if (actorId) {
      await conn.query('SET @civictrack_actor_id = ?', [actorId]);
    }

    const result = await work(conn);

    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};
