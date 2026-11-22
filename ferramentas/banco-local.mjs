import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

function sqliteValue(value) {
  return value instanceof ArrayBuffer ? new Uint8Array(value) : value;
}

// Adaptador de desenvolvimento para executar as mesmas consultas SQL em SQLite local.
class Statement {
  constructor(database, sql, args = []) {
    this.database = database;
    this.sql = sql;
    this.args = args;
  }
  bind(...args) { return new Statement(this.database, this.sql, args.map(sqliteValue)); }
  first() { return this.database.prepare(this.sql).get(...this.args) || null; }
  all() { return { results: this.database.prepare(this.sql).all(...this.args), success: true }; }
  run() {
    const result = this.database.prepare(this.sql).run(...this.args);
    return { results: [], success: true, meta: { changes: Number(result.changes) } };
  }
}

export function abrirBanco(path = ":memory:") {
  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  for (const arquivo of ["001_cadastros.sql","002_carteirinhas.sql"]) {
    sqlite.exec(readFileSync(new URL("../banco/" + arquivo, import.meta.url), "utf8"));
  }
  // 004 usa ALTER TABLE, que não pode ser repetido; aplica só se faltar a coluna.
  if (!sqlite.prepare("SELECT 1 FROM pragma_table_info('membros') WHERE name='nascimento'").get()) {
    sqlite.exec(readFileSync(new URL("../banco/004_ficha_completa.sql", import.meta.url), "utf8"));
  }
  if (!sqlite.prepare("SELECT 1 FROM pragma_table_info('membros') WHERE name='funcao_aprovada'").get()) {
    sqlite.exec(readFileSync(new URL("../banco/005_cargo_e_versos.sql", import.meta.url), "utf8"));
  }
  if (!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name='configuracao'").get()) {
    sqlite.exec(readFileSync(new URL("../banco/003_configuracao.sql", import.meta.url), "utf8"));
  }
  return {
    prepare: sql => new Statement(sqlite, sql),
    batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const result = statements.map(statement => sqlite.prepare(statement.sql).columns().length ? statement.all() : statement.run());
        sqlite.exec("COMMIT");
        return result;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
    close: () => sqlite.close()
  };
}

