import nodemailer, { Transporter } from "nodemailer";
import dns from "dns";

/*
 mailer
 Servicio de envío de correos de DevBrain.

 Si están configuradas las variables SMTP_* usa un transporte real (SMTP).
 Si no lo están (entorno de desarrollo), cae en un modo "consola": no envía
 nada pero imprime el correo en la terminal para poder copiar el enlace.
*/

// Forzar IPv4 primero al resolver DNS. En Render (free) la ruta IPv6 falla
// con ENETUNREACH y smtp.gmail.com tiene registros IPv6, así que sin esto
// el envío puede fallar en producción. En local no cambia el comportamiento.
dns.setDefaultResultOrder("ipv4first");

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
    if (transporter) return transporter;

    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
        return null;
    }

    transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT) || 587,
        secure: Number(SMTP_PORT) === 465,
        // Timeouts para no colgarse si el SMTP no responde (evita el
        // "pending" largo en Render antes de fallar).
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        auth: {
            user: SMTP_USER,
            // Las contraseñas de aplicación de Gmail se muestran con espacios;
            // los quitamos para poder pegarlas tal cual.
            pass: SMTP_PASS.replace(/\s+/g, "")
        }
    });

    return transporter;
}

interface MailInput {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

export async function sendMail({ to, subject, html, text }: MailInput): Promise<void> {

    const from = process.env.MAIL_FROM || "DevBrain <no-reply@devbrain.app>";
    const tx = getTransporter();

    if (!tx) {
        // Fallback de desarrollo: no hay SMTP configurado.
        console.log("\n========== [DEV MAILER] Correo no enviado (SMTP no configurado) ==========");
        console.log("Para:", to);
        console.log("Asunto:", subject);
        console.log("Contenido:\n", text || html);
        console.log("==========================================================================\n");
        return;
    }

    await tx.sendMail({ from, to, subject, html, text });
}

export function buildInvitationEmail(params: {
    projectName: string;
    inviterName: string;
    acceptUrl: string;
    role: string;
}): { subject: string; html: string; text: string } {

    const { projectName, inviterName, acceptUrl, role } = params;

    const subject = `${inviterName} te invitó a colaborar en "${projectName}" · DevBrain`;

    const text =
        `${inviterName} te invitó a unirte al proyecto "${projectName}" en DevBrain como ${role}.\n\n` +
        `Acepta la invitación aquí: ${acceptUrl}\n`;

    const html = `
        <div style="font-family: Arial, sans-serif; background:#08091a; padding:32px; color:#eaebf5;">
          <div style="max-width:520px; margin:0 auto; background:#11132b; border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:32px;">
            <p style="font-size:12px; letter-spacing:2px; text-transform:uppercase; color:#7b7bff; margin:0;">DevBrain</p>
            <h1 style="font-size:26px; margin:12px 0 8px;">Te invitaron a un proyecto</h1>
            <p style="color:#8e92b0; line-height:1.6;">
              <strong style="color:#eaebf5;">${inviterName}</strong> te invitó a unirte al proyecto
              <strong style="color:#eaebf5;">"${projectName}"</strong> como <strong>${role}</strong>.
            </p>
            <a href="${acceptUrl}"
               style="display:inline-block; margin-top:20px; background:#7b7bff; color:#08091a; font-weight:700; text-decoration:none; padding:14px 22px; border-radius:10px;">
               Aceptar invitación
            </a>
            <p style="color:#5b5f80; font-size:12px; margin-top:24px; word-break:break-all;">
              Si el botón no funciona, copia y pega este enlace:<br>${acceptUrl}
            </p>
          </div>
        </div>
    `;

    return { subject, html, text };
}
export function buildVerificationEmail(params: {
    userName: string;
    verificationUrl: string;
}): { subject: string; html: string; text: string } {

    const { userName, verificationUrl } = params;

    const subject = "Verifica tu cuenta de DevBrain";

    const text =
        `Hola ${userName},\n\n` +
        `Gracias por registrarte en DevBrain.\n` +
        `Para activar tu cuenta, abre el siguiente enlace:\n\n` +
        `${verificationUrl}\n\n` +
        `Este enlace es válido durante 24 horas.\n`;

    const html = `
        <div style="font-family: Arial, sans-serif; background:#08091a; padding:32px; color:#eaebf5;">
          <div style="max-width:520px; margin:0 auto; background:#11132b; border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:32px;">
            <p style="font-size:12px; letter-spacing:2px; text-transform:uppercase; color:#7b7bff; margin:0;">
              DevBrain
            </p>

            <h1 style="font-size:26px; margin:12px 0 8px;">
              Verifica tu cuenta
            </h1>

            <p style="color:#8e92b0; line-height:1.6;">
              Hola <strong style="color:#eaebf5;">${userName}</strong>,
              gracias por registrarte en DevBrain.
            </p>

            <p style="color:#8e92b0; line-height:1.6;">
              Haz clic en el botón para activar tu cuenta:
            </p>

            <a href="${verificationUrl}"
               style="display:inline-block; margin-top:20px; background:#7b7bff; color:#08091a; font-weight:700; text-decoration:none; padding:14px 22px; border-radius:10px;">
               Verificar mi cuenta
            </a>

            <p style="color:#5b5f80; font-size:12px; margin-top:24px; word-break:break-all;">
              Si el botón no funciona, copia y pega este enlace:<br>
              ${verificationUrl}
            </p>

            <p style="color:#5b5f80; font-size:12px; margin-top:16px;">
              Este enlace será válido durante 24 horas...
            </p>
          </div>
        </div>
    `;

    return { subject, html, text };
}