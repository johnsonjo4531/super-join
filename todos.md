1. [x] **Composable SQL AST**
2. [x] **Add Expression Support for WHERE and JOIN ON**
3. [ ] **Query Parameters (Dynamic Values)**
4. [ ] **Junction Tables / Many-to-Many**
5. [ ] **Add `FieldArgs` Support**
6. [ ] **Hydration Step**

From conversation with ChatGPT:

Your current `super-join` library is quite well structured and impressively functional for converting GraphQL into SQL. You're already abstracting aliases, joins, and field resolution effectively. Since you're planning for future extensibility — like where clauses, junction tables, parameters, and subqueries — now is a great time to discuss architectural enhancements before implementation gets more complex.

---

## 🔍 High-Level Opportunities for Improvement

### 1. **Composable SQL AST**

**Why:** Right now, `SqlSelect` includes only columns and joins. As you add filtering, subqueries, ordering, etc., this will grow more complex and less manageable.

**Conceptual Enhancement:**
Create a more composable SQL AST to support:

* `SELECT`
* `FROM`
* `JOIN`
* `WHERE`
* `GROUP BY`
* `ORDER BY`
* `LIMIT`, etc.

**Suggested Struct (simplified):**

```rust
pub struct SqlSelect {
    pub table: String,
    pub alias: String,
    pub columns: Vec<SqlColumn>,
    pub joins: Vec<SqlJoin>,
    pub where_clause: Option<SqlExpr>,
    pub order_by: Vec<SqlOrderBy>,
    pub limit: Option<u32>,
}
```

---

### 2. **Add Expression Support for WHERE and JOIN ON**

**Why:** SQL clauses like `WHERE` or `ON` often require expressions (e.g., `a.id = b.user_id AND b.active = true`).

**Conceptual Enhancement:**
Define an AST for SQL expressions:

```rust
pub enum SqlExpr {
    Eq(SqlValue, SqlValue),
    And(Box<SqlExpr>, Box<SqlExpr>),
    Or(Box<SqlExpr>, Box<SqlExpr>),
    Column(String),
    Literal(String),
    Param(String),
}
```

This enables composability and safe code generation. You could even serialize these expressions from JS.

---

### 3. **Query Parameters (Dynamic Values)**

**Why:** To avoid SQL injection and improve performance with prepared statements.

**Conceptual Enhancement:**
Incorporate parameters into your expression AST:

```ts
where: {
  type: "eq",
  left: { type: "column", name: "user.id" },
  right: { type: "param", name: "userId" },
}
```

Then, compile to:

```sql
WHERE "user"."id" = $userId
```

And accept parameters in a map `{ userId: 42 }`.

---

### 4. **Junction Tables / Many-to-Many**

**Why:** Common GraphQL schemas use many-to-many patterns (e.g., `users -> posts` via `post_likes`).

**Conceptual Enhancement:**
Extend `JoinInfo`:

```ts
{
  join_type: "junction",
  through: {
    table: "post_likes",
    alias: "likes",
    on_clause: `"likes".user_id = "user".id AND "likes".post_id = "post".id`
  },
  target: {
    alias: "post",
    extends: "post",
    on_clause: `"likes".post_id = "post".id`
  }
}
```

---

### 5. **Add `FieldArgs` Support**

**Why:** GraphQL fields often have arguments (`posts(limit: 10, order: "desc")`), which are important for SQL `LIMIT`, `ORDER BY`, and filtering.

**Conceptual Enhancement:**
Parse and pass arguments to `build_sql_ast`, optionally attach them to your AST:

```rust
pub struct SqlFieldArgs {
    pub limit: Option<u32>,
    pub order_by: Option<String>,
}
```

And integrate those in SQL generation.

---

### 6. **Hydration Step**

**Why:** You eventually want to hydrate flat SQL results into nested GraphQL responses.

**Conceptual Enhancement:**
You’re already planning this, but here’s a high-level idea:

* Accept rows as a flat list of maps.
* Group by the outer alias (`user_1_id`), and nest according to field names and aliases.
* You can precompute a "response blueprint" during SQL AST generation to guide nesting.

---

## ✅ Next Steps

If you'd like, I can help with:

* Implementing `SqlExpr` with parameter support.
* Defining an updated SQL AST to support all future needs.
* Modifying `JoinInfo` to support junctions.
* Enhancing `build_sql_ast` to recurse through and collect `WHERE`, `LIMIT`, etc.
* Designing a `hydrate_results` function that reconstructs nested objects from flat SQL rows.

Would you like to start with any of those (e.g., `SqlExpr` or `junction table joins`)?
