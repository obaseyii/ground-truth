/**
 * Feature flags. Safe to import from client and server code.
 *
 * USE_FIXTURES: GET API routes return the JSON in fixtures/ instead of querying the database.
 * Defaults to true. Set USE_FIXTURES=false to use real data once lib/db is ready.
 */
export const USE_FIXTURES = process.env.USE_FIXTURES !== "false";
