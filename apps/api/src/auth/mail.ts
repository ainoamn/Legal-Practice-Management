export abstract class Mailer {
  abstract configured(): boolean;
  abstract sendPasswordReset(email: string, link: string): Promise<void>;
}
export class ResendMailer extends Mailer {
  configured() {
    return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  }
  async sendPasswordReset(email: string, link: string) {
    if (!this.configured()) throw new Error("Mail delivery is disabled");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [email],
        subject: "LEGAL OFFICE AI — Password reset / استعادة كلمة المرور",
        text: `استعادة كلمة المرور / Reset your password:\n${link}\n\nينتهي الرابط بعد 30 دقيقة. إذا لم تطلبه، تجاهل هذه الرسالة.\nThis link expires in 30 minutes. Ignore it if you did not request it.`,
      }),
    });
    if (!response.ok) throw new Error("Email delivery failed");
  }
}
