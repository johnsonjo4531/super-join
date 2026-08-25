# SQL execution boundary

## Rule

Super-Join generates SQL artifacts. It never executes SQL.

```text
Super-Join
    |
SQL artifact
    |
application-owned database driver or ORM
    |
database
```

## Application responsibilities

The application selects the driver or ORM, opens and owns connections, manages pools and transactions, executes the artifact, handles retries/timeouts, and maps returned rows into its own runtime objects.

This allows an application to use `pg`, postgres.js, MySQL/SQLite drivers, SQLx, Diesel, Prisma, Drizzle, or another mechanism without making any one of them a Super-Join dependency.

## What this prevents

Maintaining this boundary prevents Super-Join from silently becoming an ORM or a database runtime. It also keeps the compiler portable across native Rust, Wasm hosts, and future frontend languages.

## Integration guidance

Consumers must pass `artifact.sql` and `artifact.parameters` according to the selected driver's parameter API and ensure the driver matches the artifact dialect. A driver mismatch is an application configuration error, not a reason for Super-Join to acquire driver adapters.

Result-shape metadata may help a separate consumer-side hydration utility in the future, but such a utility must be designed as a distinct capability and must not imply that Super-Join executes queries.

