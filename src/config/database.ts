import { Pool } from "pg";

let pool: Pool;

export function obtenerPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: {
                rejectUnauthorized: false
            }
        });
    }

    return pool;
}

export async function conectarBaseDatos() {
    try {
        const client = await obtenerPool().connect();

        console.log("Conexión exitosa a PostgreSQL (Supabase)");

        client.release();
    } catch (error) {
        console.error("Error al conectar con PostgreSQL:");
        console.error(error);

        process.exit(1);
    }
}