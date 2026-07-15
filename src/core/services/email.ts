import sgMail from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY no está configurada en las variables de entorno.");
} else {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'support@trimora.com'; // Debe ser un remitente verificado en SendGrid

export async function sendVerificationCode(email: string, code: string) {
  try {
    const msg = {
      to: email,
      from: FROM_EMAIL,
      subject: 'Trimora - Código de Verificación de Registro',
      text: `Tu código de verificación es: ${code}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0f0f0f; color: #ffffff; border-radius: 10px;">
          <h2 style="color: #8B4513; text-align: center;">Bienvenido a Trimora</h2>
          <p style="font-size: 16px;">Gracias por registrarte. Usa el siguiente código para verificar tu correo electrónico:</p>
          <div style="background-color: #1a1a1a; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #e5e5e5;">${code}</span>
          </div>
          <p style="font-size: 14px; color: #a0a0a0;">Este código expirará en 15 minutos.</p>
          <p style="font-size: 12px; color: #666; margin-top: 30px; text-align: center;">Si no solicitaste este registro, puedes ignorar este correo.</p>
        </div>
      `,
    };
    
    await sgMail.send(msg);
    return { success: true };
  } catch (error) {
    console.error('Error al enviar correo de verificación:', error);
    return { success: false, error };
  }
}

export async function sendPasswordResetCode(email: string, code: string) {
  try {
    const msg = {
      to: email,
      from: FROM_EMAIL,
      subject: 'Trimora - Recuperación de Contraseña',
      text: `Tu código de recuperación es: ${code}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0f0f0f; color: #ffffff; border-radius: 10px;">
          <h2 style="color: #8B4513; text-align: center;">Recuperación de Contraseña</h2>
          <p style="font-size: 16px;">Hemos recibido una solicitud para restablecer tu contraseña. Usa el siguiente código para continuar:</p>
          <div style="background-color: #1a1a1a; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #e5e5e5;">${code}</span>
          </div>
          <p style="font-size: 14px; color: #a0a0a0;">Este código expirará en 15 minutos.</p>
          <p style="font-size: 12px; color: #666; margin-top: 30px; text-align: center;">Si no solicitaste restablecer tu contraseña, ignora este correo y tu cuenta seguirá segura.</p>
        </div>
      `,
    };
    
    await sgMail.send(msg);
    return { success: true };
  } catch (error) {
    console.error('Error al enviar correo de recuperación:', error);
    return { success: false, error };
  }
}

export async function sendInvitationEmail(email: string, orgName: string, role: string, token: string) {
  try {
    const inviteUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/invite?token=${token}`;
    
    // Diccionario de roles para mostrar en español
    const roleNames: Record<string, string> = {
      'ADMIN': 'Administrador',
      'BARBER': 'Barbero',
      'RECEPTIONIST': 'Recepcionista'
    };
    
    const roleDisplay = roleNames[role] || role;

    const msg = {
      to: email,
      from: FROM_EMAIL,
      subject: `Trimora - Has sido invitado a unirte a ${orgName}`,
      text: `Has sido invitado a unirte a ${orgName} como ${roleDisplay}. Para aceptar la invitación, haz clic aquí: ${inviteUrl}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0f0f0f; color: #ffffff; border-radius: 10px;">
          <h2 style="color: #8B4513; text-align: center;">¡Tienes una nueva invitación!</h2>
          <p style="font-size: 16px;">Has sido invitado para formar parte del equipo de <strong>${orgName}</strong> con el rol de <strong>${roleDisplay}</strong>.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteUrl}" style="background-color: #8B4513; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Aceptar Invitación
            </a>
          </div>
          <p style="font-size: 14px; color: #a0a0a0; text-align: center;">
            O copia y pega el siguiente enlace en tu navegador:<br/>
            <span style="color: #4b9fff;">${inviteUrl}</span>
          </p>
          <p style="font-size: 12px; color: #666; margin-top: 30px; text-align: center;">Si no conoces a esta organización, puedes ignorar este correo.</p>
        </div>
      `,
    };
    
    await sgMail.send(msg);
    return { success: true };
  } catch (error) {
    console.error('Error al enviar correo de invitación:', error);
    return { success: false, error };
  }
}
