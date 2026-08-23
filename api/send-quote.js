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

async function getRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function parseMultipart(buffer, contentType) {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

  if (!match) {
    throw new Error("No se encontró el boundary del formulario");
  }

  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const parts = [];

  let start = 0;

  while (true) {
    const boundaryIndex = buffer.indexOf(boundary, start);

    if (boundaryIndex === -1) break;

    const nextStart = boundaryIndex + boundary.length;

    if (buffer[nextStart] === 45 && buffer[nextStart + 1] === 45) {
      break;
    }

    let partStart = nextStart;

    if (
      buffer[partStart] === 13 &&
      buffer[partStart + 1] === 10
    ) {
      partStart += 2;
    }

    const nextBoundary = buffer.indexOf(boundary, partStart);

    if (nextBoundary === -1) break;

    let part = buffer.subarray(partStart, nextBoundary);

    if (
      part.length >= 2 &&
      part[part.length - 2] === 13 &&
      part[part.length - 1] === 10
    ) {
      part = part.subarray(0, part.length - 2);
    }

    const headerEnd = part.indexOf(
      Buffer.from("\r\n\r\n")
    );

    if (headerEnd === -1) {
      start = nextBoundary;
      continue;
    }

    const headers = part
      .subarray(0, headerEnd)
      .toString("utf8");

    const content = part.subarray(headerEnd + 4);

    const nameMatch = headers.match(
      /name="([^"]+)"/i
    );

    if (!nameMatch) {
      start = nextBoundary;
      continue;
    }

    const name = nameMatch[1];

    const filenameMatch = headers.match(
      /filename="([^"]*)"/i
    );

    const contentTypeMatch = headers.match(
      /Content-Type:\s*([^\r\n]+)/i
    );

    parts.push({
      name,
      filename: filenameMatch
        ? filenameMatch[1]
        : null,
      contentType: contentTypeMatch
        ? contentTypeMatch[1].trim()
        : null,
      content,
    });

    start = nextBoundary;
  }

  return parts;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método no permitido",
    });
  }

  try {
    const contentType =
      req.headers["content-type"] || "";

    const rawBody = await getRawBody(req);

    let fields = {};
    let attachment = null;

    // FORMULARIO CON ARCHIVO
    if (
      contentType
        .toLowerCase()
        .includes("multipart/form-data")
    ) {
      const parts = parseMultipart(
        rawBody,
        contentType
      );

      for (const part of parts) {
        if (part.filename) {
          if (part.content.length > 20 * 1024 * 1024) {
            return res.status(400).json({
              error:
                "El archivo supera el límite de 20 MB.",
            });
          }

          attachment = {
            filename: part.filename,
            content: part.content.toString("base64"),
            content_type:
              part.contentType ||
              "application/octet-stream",
          };
        } else {
          fields[part.name] =
            part.content.toString("utf8");
        }
      }
    }

    // FORMULARIO JSON
    else {
      try {
        fields = JSON.parse(
          rawBody.toString("utf8")
        );
      } catch {
        return res.status(400).json({
          error: "No se pudo leer el formulario.",
        });
      }
    }

    const nombre = fields.nombre || "";
    const email = fields.email || "";
    const telefono = fields.telefono || "";
    const producto = fields.producto || "";
    const cantidad = fields.cantidad || "";
    const mensaje =
      fields.mensaje ||
      fields.detalles ||
      "";

    if (!nombre || !email || !producto) {
      return res.status(400).json({
        error:
          "Faltan datos obligatorios: nombre, email o producto.",
      });
    }

    const emailBody = {
      from: `Impresiones Gráficas J.I. <cotizaciones@${process.env.RESEND_EMAIL_DOMAIN}>`,

      to: ["juanaguilerap@yahoo.com"],

      reply_to: email,

      subject:
        `Nueva solicitud de cotización - ${producto}`,

      html: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: auto;">

          <h2 style="color:#183B70;">
            Nueva solicitud de cotización
          </h2>

          <hr>

          <p>
            <strong>Nombre:</strong>
            ${escapeHtml(nombre)}
          </p>

          <p>
            <strong>Correo:</strong>
            ${escapeHtml(email)}
          </p>

          <p>
            <strong>Teléfono:</strong>
            ${escapeHtml(telefono || "No indicado")}
          </p>

          <p>
            <strong>Producto o trabajo:</strong>
            ${escapeHtml(producto)}
          </p>

          <p>
            <strong>Cantidad:</strong>
            ${escapeHtml(cantidad || "No indicada")}
          </p>

          <h3 style="color:#183B70;">
            Detalles adicionales
          </h3>

          <p>
            ${escapeHtml(
              mensaje || "Sin información adicional"
            ).replace(/\n/g, "<br>")}
          </p>

          ${
            attachment
              ? `
                <hr>
                <p>
                  <strong>Archivo adjunto:</strong>
                  ${escapeHtml(
                    attachment.filename
                  )}
                </p>
              `
              : ""
          }

        </div>
      `,
    };

    // AGREGAR ARCHIVO ADJUNTO SI EXISTE
    if (attachment) {
      emailBody.attachments = [
        {
          filename: attachment.filename,
          content: attachment.content,
          content_type: attachment.content_type,
        },
      ];
    }

    const response = await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          Authorization:
            `Bearer ${process.env.RESEND_API_KEY}`,
        },

        body: JSON.stringify(emailBody),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "ERROR RESEND:",
        data
      );

      return res.status(response.status).json({
        error:
          data.message ||
          "Resend no pudo enviar el correo.",
      });
    }

    console.log(
      "CORREO ENVIADO:",
      data
    );

    return res.status(200).json({
      success: true,
      message:
        "Cotización enviada correctamente.",
    });

  } catch (error) {
    console.error(
      "ERROR SERVIDOR:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Error interno del servidor.",
    });
  }
}
