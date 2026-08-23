export const config = {
  api: {
    bodyParser: false,
  },
};

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || "";

    if (!contentType.includes("multipart/form-data")) {
      return reject(new Error("El formulario no fue enviado como multipart/form-data."));
    }

    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);

    if (!boundaryMatch) {
      return reject(new Error("No se encontró el boundary del formulario."));
    }

    const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);

    const chunks = [];

    req.on("data", (chunk) => {
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks);
        const fields = {};
        let file = null;

        let position = body.indexOf(boundary);

        while (position !== -1) {
          const nextPosition = body.indexOf(boundary, position + boundary.length);

          if (nextPosition === -1) {
            break;
          }

          const part = body.slice(
            position + boundary.length,
            nextPosition
          );

          const headerEnd = part.indexOf("\r\n\r\n");

          if (headerEnd === -1) {
            position = nextPosition;
            continue;
          }

          const headers = part
            .slice(0, headerEnd)
            .toString("utf8");

          let content = part.slice(headerEnd + 4);

          if (content.slice(-2).toString() === "\r\n") {
            content = content.slice(0, -2);
          }

          const nameMatch = headers.match(
            /name="([^"]+)"/
          );

          if (!nameMatch) {
            position = nextPosition;
            continue;
          }

          const fieldName = nameMatch[1];

          const filenameMatch = headers.match(
            /filename="([^"]*)"/
          );

          if (filenameMatch && filenameMatch[1]) {
            const filename = filenameMatch[1];

            file = {
              filename,
              content,
              contentType:
                (
                  headers.match(
                    /Content-Type:\s*([^\r\n]+)/i
                  ) || []
                )[1] || "application/octet-stream",
            };
          } else {
            fields[fieldName] = content.toString("utf8");
          }

          position = nextPosition;
        }

        resolve({ fields, file });
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Método no permitido",
    });
  }

  try {
    const { fields, file } = await parseMultipart(req);

    const nombre = fields.nombre || "";
    const empresa = fields.empresa || "";
    const whatsapp = fields.whatsapp || "";
    const email = fields.email || "";
    const servicio = fields.servicio || "";
    const cantidad = fields.cantidad || "";
    const papel = fields.papel || "";
    const acabado = fields.acabado || "";
    const mensaje = fields.mensaje || "";

    if (!nombre || !email || !servicio) {
      return res.status(400).json({
        ok: false,
        error: "Faltan datos obligatorios.",
      });
    }

    const maxFileSize = 4 * 1024 * 1024;

    if (file && file.content.length > maxFileSize) {
      return res.status(400).json({
        ok: false,
        error: "El archivo es demasiado grande. Por favor adjunta un archivo de hasta 4 MB.",
      });
    }

    const attachments = [];

    if (file) {
      attachments.push({
        filename: file.filename,
        content: file.content.toString("base64"),
      });
    }

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222;">
        <h2>Nueva solicitud de cotización</h2>

        <h3>Datos del cliente</h3>

        <p>
          <strong>Nombre:</strong>
          ${escapeHtml(nombre)}
        </p>

        <p>
          <strong>Empresa / Institución:</strong>
          ${escapeHtml(empresa || "No indicada")}
        </p>

        <p>
          <strong>WhatsApp:</strong>
          ${escapeHtml(whatsapp || "No indicado")}
        </p>

        <p>
          <strong>Correo:</strong>
          ${escapeHtml(email)}
        </p>

        <h3>Detalles del trabajo</h3>

        <p>
          <strong>Producto o servicio:</strong>
          ${escapeHtml(servicio)}
        </p>

        <p>
          <strong>Cantidad:</strong>
          ${escapeHtml(cantidad || "No indicada")}
        </p>

        <p>
          <strong>Papel / Material:</strong>
          ${escapeHtml(papel || "No indicado")}
        </p>

        <p>
          <strong>Acabado / Terminación:</strong>
          ${escapeHtml(acabado || "No indicado")}
        </p>

        <h3>Detalles adicionales</h3>

        <p>
          ${escapeHtml(mensaje || "Sin detalles adicionales.")}
        </p>

        ${
          file
            ? `
              <p>
                <strong>Archivo adjunto:</strong>
                ${escapeHtml(file.filename)}
              </p>
            `
            : `
              <p>
                <strong>Archivo adjunto:</strong>
                No se adjuntó ningún archivo.
              </p>
            `
        }
      </div>
    `;

    const response = await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Impresiones Gráficas J.I. <cotizaciones@impresionesgraficasji.cl>",
          to: ["juanaguilerap@yahoo.com"],
          reply_to: email,
          subject: `Nueva solicitud de cotización — ${servicio}`,
          html,
          attachments,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Error de Resend:", data);

      return res.status(response.status).json({
        ok: false,
        error:
          data.message ||
          "Resend no pudo enviar el correo.",
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Cotización enviada correctamente.",
    });
  } catch (error) {
    console.error("Error en send-quote:", error);

    return res.status(500).json({
      ok: false,
      error:
        error.message ||
        "Error interno al procesar la cotización.",
    });
  }
}
