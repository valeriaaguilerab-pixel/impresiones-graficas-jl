export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Método no permitido"
    });
  }

  try {
    const contentType = req.headers["content-type"] || "";

    if (!contentType.includes("multipart/form-data")) {
      return res.status(400).json({
        ok: false,
        error: "La solicitud no tiene el formato correcto."
      });
    }

    const boundaryMatch = contentType.match(
      /boundary=(?:"([^"]+)"|([^;]+))/i
    );

    if (!boundaryMatch) {
      return res.status(400).json({
        ok: false,
        error: "No se encontró el límite del formulario."
      });
    }

    const boundary =
      boundaryMatch[1] || boundaryMatch[2];

    // Límite máximo: 4 MB
    const MAX_UPLOAD_SIZE = 4 * 1024 * 1024;

    const rawBody = await readRequestBody(
      req,
      MAX_UPLOAD_SIZE
    );

    const parts = parseMultipart(
      rawBody,
      boundary
    );

    const fields = {};
    let attachment = null;

    for (const part of parts) {
      if (!part.name) continue;

      // ARCHIVO
      if (part.filename) {

        if (part.data.length > MAX_UPLOAD_SIZE) {
          return res.status(400).json({
            ok: false,
            error:
              "El archivo supera el límite permitido de 4 MB. Puedes enviarlo por nuestros otros canales de contacto."
          });
        }

        if (part.data.length > 0) {
          attachment = {
            filename: part.filename,
            content:
              part.data.toString("base64")
          };
        }

        continue;
      }

      // CAMPOS NORMALES
      fields[part.name] =
        part.data
          .toString("utf8")
          .trim();
    }

    // =====================================================
    // DATOS DEL FORMULARIO
    // =====================================================

    const nombre =
      fields.nombre || "";

    const empresa =
      fields.empresa ||
      "Particular";

    const whatsapp =
      fields.whatsapp ||
      fields.telefono ||
      "No indicado";

    const email =
      fields.email ||
      "";

    const producto =
      fields.servicio ||
      fields.producto ||
      "";

    const cantidad =
      fields.cantidad ||
      "No indicada";

    const papel =
      fields.papel ||
      "A definir";

    const acabado =
      fields.acabado ||
      "Estándar";

    const mensaje =
      fields.mensaje ||
      fields.detalles ||
      "Sin detalles adicionales";


    // =====================================================
    // VALIDACIONES
    // =====================================================

    if (!nombre) {
      return res.status(400).json({
        ok: false,
        error: "Falta el nombre."
      });
    }

    if (!email) {
      return res.status(400).json({
        ok: false,
        error:
          "Falta el correo electrónico."
      });
    }

    if (!producto) {
      return res.status(400).json({
        ok: false,
        error:
          "Falta indicar el producto o trabajo."
      });
    }


    // =====================================================
    // RESEND API KEY
    // =====================================================

    if (!process.env.RESEND_API_KEY) {

      console.error(
        "Falta RESEND_API_KEY en Vercel."
      );

      return res.status(500).json({
        ok: false,
        error:
          "El servicio de correo no está configurado correctamente."
      });
    }


    // =====================================================
    // CORREO
    // =====================================================

    const emailPayload = {

      from:
        "Impresiones Gráficas J.I. <cotizaciones@impresionesgraficasji.cl>",

      to: [
        "juanaguilerap@yahoo.com"
      ],

      reply_to:
        email,

      subject:
        `Nueva solicitud de cotización - ${producto}`,

      // ===================================================
      // TEXTO PLANO
      // ===================================================

      text: `
Nueva solicitud de cotización

DATOS DEL CLIENTE

Nombre: ${nombre}
Empresa / Institución: ${empresa}
WhatsApp: ${whatsapp}
Correo: ${email}

DETALLES DEL TRABAJO

Producto o trabajo: ${producto}
Cantidad: ${cantidad}
Papel / Material: ${papel}
Acabado / Terminación: ${acabado}

DETALLES ADICIONALES

${mensaje}

Archivo adjunto:
${
  attachment
    ? attachment.filename
    : "No se adjuntó archivo."
}

Solicitud enviada desde:
impresionesgraficasji.cl
`.trim(),


      // ===================================================
      // HTML
      // ===================================================

      html: `
        <div
          style="
            font-family: Arial, sans-serif;
            color: #1f2937;
            line-height: 1.6;
          "
        >

          <h2 style="color:#173B73;">
            Nueva solicitud de cotización
          </h2>

          <hr>

          <h3 style="color:#173B73;">
            Datos del cliente
          </h3>

          <p>
            <strong>Nombre:</strong>
            ${escapeHtml(nombre)}
          </p>

          <p>
            <strong>Empresa / Institución:</strong>
            ${escapeHtml(empresa)}
          </p>

          <p>
            <strong>WhatsApp:</strong>
            ${escapeHtml(whatsapp)}
          </p>

          <p>
            <strong>Correo:</strong>
            ${escapeHtml(email)}
          </p>

          <h3 style="color:#173B73;">
            Detalles del trabajo
          </h3>

          <p>
            <strong>Producto o trabajo:</strong>
            ${escapeHtml(producto)}
          </p>

          <p>
            <strong>Cantidad:</strong>
            ${escapeHtml(cantidad)}
          </p>

          <p>
            <strong>Papel / Material:</strong>
            ${escapeHtml(papel)}
          </p>

          <p>
            <strong>Acabado / Terminación:</strong>
            ${escapeHtml(acabado)}
          </p>

          <h3 style="color:#173B73;">
            Detalles adicionales
          </h3>

          <p>
            ${escapeHtml(mensaje)
              .replace(/\n/g, "<br>")}
          </p>

          <hr>

          ${
            attachment
              ? `
                <p>
                  <strong>Archivo adjunto:</strong>
                  ${escapeHtml(
                    attachment.filename
                  )}
                </p>
              `
              : `
                <p>
                  <strong>Archivo adjunto:</strong>
                  No se adjuntó archivo.
                </p>
              `
          }

          <br>

          <p style="color:#666;">
            Solicitud enviada desde
            impresionesgraficasji.cl
          </p>

        </div>
      `
    };


    // =====================================================
    // ADJUNTO
    // =====================================================

    if (attachment) {

      emailPayload.attachments = [
        {
          filename:
            attachment.filename,

          content:
            attachment.content
        }
      ];
    }


    // =====================================================
    // ENVIAR A RESEND
    // =====================================================

    console.log(
      "Enviando cotización a Yahoo mediante Resend..."
    );

    const response =
      await fetch(
        "https://api.resend.com/emails",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${process.env.RESEND_API_KEY}`
          },

          body:
            JSON.stringify(
              emailPayload
            )
        }
      );


    const responseText =
      await response.text();

    let data;

    try {

      data =
        JSON.parse(
          responseText
        );

    } catch {

      data = {
        message:
          responseText
      };
    }


    // =====================================================
    // ERROR RESEND
    // =====================================================

    if (!response.ok) {

      console.error(
        "RESPUESTA DE RESEND:",
        response.status,
        data
      );

      return res.status(
        response.status
      ).json({

        ok: false,

        error:
          data.message ||
          data.error ||
          "Resend rechazó el envío del correo."
      });
    }


    // =====================================================
    // ÉXITO
    // =====================================================

    console.log(
      "CORREO ENVIADO CORRECTAMENTE:",
      data
    );

    return res.status(200).json({

      ok: true,

      message:
        "Cotización enviada correctamente.",

      emailId:
        data.id || null
    });


  } catch (error) {

    console.error(
      "ERROR GENERAL EN SEND-QUOTE:",
      error
    );

    return res.status(500).json({

      ok: false,

      error:
        error.message ||
        "Error interno del servidor."
    });
  }
}


// =====================================================
// LEER BODY
// =====================================================

function readRequestBody(
  req,
  maxSize
) {

  return new Promise(
    (resolve, reject) => {

      const chunks = [];

      let totalSize = 0;

      let finished = false;


      req.on(
        "data",
        (chunk) => {

          if (finished) return;

          totalSize +=
            chunk.length;


          if (
            totalSize >
            maxSize
          ) {

            finished = true;

            reject(
              new Error(
                "El archivo o formulario supera el límite de 4 MB."
              )
            );

            req.destroy();

            return;
          }


          chunks.push(
            Buffer.from(chunk)
          );
        }
      );


      req.on(
        "end",
        () => {

          if (finished) return;

          finished = true;

          resolve(
            Buffer.concat(
              chunks
            )
          );
        }
      );


      req.on(
        "error",
        (error) => {

          if (finished) return;

          finished = true;

          reject(error);
        }
      );

    }
  );
}


// =====================================================
// PARSER MULTIPART
// =====================================================

function parseMultipart(
  buffer,
  boundary
) {

  const delimiter =
    Buffer.from(
      `--${boundary}`
    );

  const parts = [];

  let position = 0;


  while (
    position <
    buffer.length
  ) {

    const start =
      buffer.indexOf(
        delimiter,
        position
      );


    if (
      start === -1
    ) {
      break;
    }


    const afterBoundary =
      start +
      delimiter.length;


    // FINAL
    if (
      buffer[
        afterBoundary
      ] === 45 &&
      buffer[
        afterBoundary + 1
      ] === 45
    ) {

      break;
    }


    let partStart =
      afterBoundary;


    // CRLF
    if (
      buffer[
        partStart
      ] === 13 &&
      buffer[
        partStart + 1
      ] === 10
    ) {

      partStart += 2;
    }


    const nextBoundary =
      buffer.indexOf(
        delimiter,
        partStart
      );


    if (
      nextBoundary === -1
    ) {

      break;
    }


    let partBuffer =
      buffer.subarray(
        partStart,
        nextBoundary
      );


    // QUITAR CRLF
    if (
      partBuffer.length >= 2 &&
      partBuffer[
        partBuffer.length - 2
      ] === 13 &&
      partBuffer[
        partBuffer.length - 1
      ] === 10
    ) {

      partBuffer =
        partBuffer.subarray(
          0,
          partBuffer.length - 2
        );
    }


    const headerEnd =
      partBuffer.indexOf(
        Buffer.from(
          "\r\n\r\n"
        )
      );


    if (
      headerEnd === -1
    ) {

      position =
        nextBoundary;

      continue;
    }


    const headerText =
      partBuffer
        .subarray(
          0,
          headerEnd
        )
        .toString(
          "utf8"
        );


    const data =
      partBuffer.subarray(
        headerEnd + 4
      );


    const dispositionMatch =
      headerText.match(
        /Content-Disposition:\s*form-data;\s*([^]*?)(?:\r\n|$)/i
      );


    if (
      !dispositionMatch
    ) {

      position =
        nextBoundary;

      continue;
    }


    const disposition =
      dispositionMatch[1];


    const nameMatch =
      disposition.match(
        /name="([^"]*)"/i
      );


    const filenameMatch =
      disposition.match(
        /filename="([^"]*)"/i
      );


    const contentTypeMatch =
      headerText.match(
        /Content-Type:\s*([^\r\n]+)/i
      );


    parts.push({

      name:
        nameMatch
          ? nameMatch[1]
          : "",

      filename:
        filenameMatch
          ? filenameMatch[1]
          : null,

      contentType:
        contentTypeMatch
          ? contentTypeMatch[1].trim()
          : null,

      data

    });


    position =
      nextBoundary;
  }


  return parts;
}


// =====================================================
// ESCAPAR HTML
// =====================================================

function escapeHtml(
  value
) {

  return String(value)

    .replace(
      /&/g,
      "&amp;"
    )

    .replace(
      /</g,
      "&lt;"
    )

    .replace(
      />/g,
      "&gt;"
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&#039;"
    );
}
