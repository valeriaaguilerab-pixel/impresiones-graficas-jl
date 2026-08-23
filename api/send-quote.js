export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const {
      nombre,
      email,
      telefono,
      producto,
      cantidad,
      mensaje
    } = req.body;

    if (!nombre || !email || !producto) {
      return res.status(400).json({
        error: "Faltan datos obligatorios"
      });
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: `Impresiones Gráficas J.I. <cotizaciones@${process.env.RESEND_EMAIL_DOMAIN}>`,
        to: ["juanaguilerap@yahoo.com"],
        reply_to: email,
        subject: `Nueva solicitud de cotización - ${producto}`,
        html: `
          <h2>Nueva solicitud de cotización</h2>

          <p><strong>Nombre:</strong> ${nombre}</p>
          <p><strong>Correo:</strong> ${email}</p>
          <p><strong>Teléfono:</strong> ${telefono || "No indicado"}</p>
          <p><strong>Producto o trabajo:</strong> ${producto}</p>
          <p><strong>Cantidad:</strong> ${cantidad || "No indicada"}</p>

          <h3>Mensaje</h3>
          <p>${mensaje || "Sin mensaje adicional"}</p>
        `
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || "Error al enviar el correo"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Cotización enviada correctamente"
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Error interno del servidor"
    });
  }
}
