import { Resend } from "resend";

/*
 mailer
 Servicio de envío de correos de DevBrain.

 Si está configurada la variable RESEND_API_KEY, los correos
 se envían mediante la API HTTPS de Resend.

 Si no está configurada, el backend usa un modo de desarrollo:
 no envía el correo, pero imprime su contenido en la terminal.
*/

const resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

interface MailInput {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

/* =========================
   SEND MAIL
========================= */
export async function sendMail({
    to,
    subject,
    html,
    text
}: MailInput): Promise<void> {
    const from =
        process.env.MAIL_FROM ||
        "DevBrain <onboarding@resend.dev>";

    if (!resend) {
        console.log(
            "\n========== [DEV MAILER] Correo no enviado (Resend no configurado) =========="
        );
        console.log("Para:", to);
        console.log("Asunto:", subject);
        console.log("Contenido:\n", text || html);
        console.log(
            "============================================================================\n"
        );

        return;
    }

    const { data, error } = await resend.emails.send({
        from,
        to: [to],
        subject,
        html,
        text
    });

    if (error) {
        throw new Error(
            `Error al enviar correo con Resend: ${error.message}`
        );
    }

    console.log(
        "Correo enviado correctamente con Resend:",
        data?.id
    );
}

/* =========================
   INVITATION EMAIL
========================= */
export function buildInvitationEmail(params: {
    projectName: string;
    inviterName: string;
    acceptUrl: string;
    role: string;
}): {
    subject: string;
    html: string;
    text: string;
} {
    const {
        projectName,
        inviterName,
        acceptUrl,
        role
    } = params;

    const subject =
        `${inviterName} te invitó a colaborar en "${projectName}" · DevBrain`;

    const text =
        `${inviterName} te invitó a unirte al proyecto ` +
        `"${projectName}" en DevBrain como ${role}.\n\n` +
        `Acepta la invitación aquí: ${acceptUrl}\n`;

    const html = `
        <div
          style="
            font-family: Arial, sans-serif;
            background: #08091a;
            padding: 32px;
            color: #eaebf5;
          "
        >
          <div
            style="
              max-width: 520px;
              margin: 0 auto;
              background: #11132b;
              border: 1px solid rgba(255,255,255,0.1);
              border-radius: 16px;
              padding: 32px;
            "
          >
            <p
              style="
                font-size: 12px;
                letter-spacing: 2px;
                text-transform: uppercase;
                color: #7b7bff;
                margin: 0;
              "
            >
              DevBrain
            </p>

            <h1 style="font-size: 26px; margin: 12px 0 8px;">
              Te invitaron a un proyecto
            </h1>

            <p style="color: #8e92b0; line-height: 1.6;">
              <strong style="color: #eaebf5;">
                ${inviterName}
              </strong>

              te invitó a unirte al proyecto

              <strong style="color: #eaebf5;">
                "${projectName}"
              </strong>

              como

              <strong>
                ${role}
              </strong>.
            </p>

            <a
              href="${acceptUrl}"
              style="
                display: inline-block;
                margin-top: 20px;
                background: #7b7bff;
                color: #08091a;
                font-weight: 700;
                text-decoration: none;
                padding: 14px 22px;
                border-radius: 10px;
              "
            >
              Aceptar invitación
            </a>

            <p
              style="
                color: #5b5f80;
                font-size: 12px;
                margin-top: 24px;
                word-break: break-all;
              "
            >
              Si el botón no funciona, copia y pega este enlace:
              <br>
              ${acceptUrl}
            </p>
          </div>
        </div>
    `;

    return {
        subject,
        html,
        text
    };
}

/* =========================
   VERIFICATION EMAIL
========================= */
export function buildVerificationEmail(params: {
    userName: string;
    verificationUrl: string;
}): {
    subject: string;
    html: string;
    text: string;
} {
    const {
        userName,
        verificationUrl
    } = params;

    const subject =
        "Verifica tu cuenta de DevBrain";

    const text =
        `Hola ${userName},\n\n` +
        `Gracias por registrarte en DevBrain.\n` +
        `Para activar tu cuenta, abre el siguiente enlace:\n\n` +
        `${verificationUrl}\n\n` +
        `Este enlace es válido durante 24 horas.\n`;

    const html = `
        <div
          style="
            font-family: Arial, sans-serif;
            background: #08091a;
            padding: 32px;
            color: #eaebf5;
          "
        >
          <div
            style="
              max-width: 520px;
              margin: 0 auto;
              background: #11132b;
              border: 1px solid rgba(255,255,255,0.1);
              border-radius: 16px;
              padding: 32px;
            "
          >
            <p
              style="
                font-size: 12px;
                letter-spacing: 2px;
                text-transform: uppercase;
                color: #7b7bff;
                margin: 0;
              "
            >
              DevBrain
            </p>

            <h1 style="font-size: 26px; margin: 12px 0 8px;">
              Verifica tu cuenta
            </h1>

            <p style="color: #8e92b0; line-height: 1.6;">
              Hola

              <strong style="color: #eaebf5;">
                ${userName}
              </strong>,

              gracias por registrarte en DevBrain.
            </p>

            <p style="color: #8e92b0; line-height: 1.6;">
              Haz clic en el botón para activar tu cuenta:
            </p>

            <a
              href="${verificationUrl}"
              style="
                display: inline-block;
                margin-top: 20px;
                background: #7b7bff;
                color: #08091a;
                font-weight: 700;
                text-decoration: none;
                padding: 14px 22px;
                border-radius: 10px;
              "
            >
              Verificar mi cuenta
            </a>

            <p
              style="
                color: #5b5f80;
                font-size: 12px;
                margin-top: 24px;
                word-break: break-all;
              "
            >
              Si el botón no funciona, copia y pega este enlace:
              <br>
              ${verificationUrl}
            </p>

            <p
              style="
                color: #5b5f80;
                font-size: 12px;
                margin-top: 16px;
              "
            >
              Este enlace será válido durante 24 horas.
            </p>
          </div>
        </div>
    `;

    return {
        subject,
        html,
        text
    };
}