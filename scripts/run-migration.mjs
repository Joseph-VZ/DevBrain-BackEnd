/*
 Runner simple de migraciones para DevBrain.

 Uso:
   node scripts/run-migration.mjs db/migrations/002_invitaciones.sql

 Lee DATABASE_URL desde .env y ejecuta el archivo SQL indicado.
*/
import "dotenv/config";
import { readFileSync } from "fs";
import { resolve } from "path";
import pg from "pg";

const file = process.argv[2];

if (!file) {
    console.error("Uso: node scripts/run-migration.mjs <ruta-al-archivo.sql>");
    process.exit(1);
}

const sql = readFileSync(resolve(file), "utf8");

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

try {
    console.log(`Ejecutando migración: ${file}`);
    await pool.query(sql);
    console.log("✅ Migración aplicada correctamente.");
} catch (error) {
    console.error("❌ Error al aplicar la migración:");
    console.error(error.message);
    process.exit(1);
} finally {
    await pool.end();
}
