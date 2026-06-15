export default {
  // Prevent Error 1101 if visited in a browser
  async fetch(request, env, ctx) {
    return new Response("PSO Aurora Email Webhook Handler is online.", {
      headers: { "Content-Type": "text/plain" }
    });
  },

  async email(message, env, ctx) {
    const WEBHOOK_URL = "https://your-domain.com/api/emails/inbound?token=pso_aurora_webhook_jeypi010495";

    try {
      // 1. Read the raw email stream as text
      const rawEmail = await new Response(message.raw).text();

      // 2. Build a payload containing the raw MIME message and metadata
      const payload = {
        uuid: message.id,
        from: message.from,
        to: message.to,
        subject: message.headers.get("subject") || "",
        date: message.headers.get("date") || new Date().toISOString(),
        raw: rawEmail
      };

      // 3. POST the payload to the Node backend (which will handle the parsing)
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Backend webhook responded with status ${response.status}`);
      }

      console.log("Email forwarded to backend successfully.");
    } catch (error) {
      console.error("Failed to forward email:", error);
    }
  }
};
