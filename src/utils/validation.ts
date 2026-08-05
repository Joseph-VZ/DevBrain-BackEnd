/*
 validation
 Reglas de validación de las entradas del registro de usuarios.

 Viven aquí y no dentro del controlador porque la misma política se describe
 palabra por palabra en el frontend (src/utils/passwordPolicy.js). Si una regla
 cambia, tiene que cambiar en los dos lados: el frontend es comodidad para el
 usuario, esta es la validación que realmente protege la base de datos.
*/

export const PASSWORD_MIN_LENGTH = 8;

// bcrypt solo considera los primeros 72 bytes de la contraseña: más allá de eso
// la longitud extra no aporta seguridad y se truncaría en silencio. Cortamos antes.
export const PASSWORD_MAX_LENGTH = 64;

// Límites alineados con el esquema: usuarios.nombre VARCHAR(100), correo VARCHAR(150).
export const NAME_MAX_LENGTH = 100;
export const EMAIL_MAX_LENGTH = 150;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

// Cualquier cosa que no sea letra ni número cuenta como símbolo.
const SYMBOL_REGEX = /[^A-Za-z0-9]/;

/*
 Cada validador devuelve el mensaje de error, o null si el valor es válido.
 Se devuelve un solo mensaje a la vez para no abrumar al usuario con una lista.
*/

export function validateName(name: unknown): string | null {
    if (typeof name !== "string" || !name.trim()) {
        return "El nombre es obligatorio";
    }

    const clean = name.trim();

    if (clean.length < 2) {
        return "El nombre debe tener al menos 2 caracteres";
    }

    if (clean.length > NAME_MAX_LENGTH) {
        return `El nombre no puede superar los ${NAME_MAX_LENGTH} caracteres`;
    }

    return null;
}

export function validateEmail(email: unknown): string | null {
    if (typeof email !== "string" || !email.trim()) {
        return "El correo es obligatorio";
    }

    const clean = email.trim();

    if (clean.length > EMAIL_MAX_LENGTH) {
        return `El correo no puede superar los ${EMAIL_MAX_LENGTH} caracteres`;
    }

    if (!EMAIL_REGEX.test(clean)) {
        return "El correo no tiene un formato válido";
    }

    return null;
}

export function validatePassword(password: unknown): string | null {
    if (typeof password !== "string" || password.length === 0) {
        return "La contraseña es obligatoria";
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
        return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`;
    }

    if (password.length > PASSWORD_MAX_LENGTH) {
        return `La contraseña no puede superar los ${PASSWORD_MAX_LENGTH} caracteres`;
    }

    if (!/[a-z]/.test(password)) {
        return "La contraseña debe incluir al menos una letra minúscula";
    }

    if (!/[A-Z]/.test(password)) {
        return "La contraseña debe incluir al menos una letra mayúscula";
    }

    if (!/[0-9]/.test(password)) {
        return "La contraseña debe incluir al menos un número";
    }

    if (!SYMBOL_REGEX.test(password)) {
        return "La contraseña debe incluir al menos un símbolo (por ejemplo: ! @ # $ %)";
    }

    return null;
}

/*
 Valida el cuerpo completo del registro y devuelve el primer error encontrado.
 El orden importa: nombre, correo y al final la contraseña, para que el usuario
 corrija los campos en el mismo orden en que los ve en el formulario.
*/
export function validateRegisterInput(body: {
    name?: unknown;
    email?: unknown;
    password?: unknown;
}): string | null {
    return (
        validateName(body.name) ||
        validateEmail(body.email) ||
        validatePassword(body.password)
    );
}
