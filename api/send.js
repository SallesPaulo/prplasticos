
const { Resend } = require("resend");
const crypto = require("crypto");

function obterCookie(req, nome) {
  const cookies = req.headers.cookie || "";
  const item = cookies
    .split(";")
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(nome + "="));

  if (!item) return null;

  try {
    return decodeURIComponent(
      item.substring(nome.length + 1)
    );
  } catch {
    return null;
  }
}

function sessaoValida(req) {
  const email = process.env.PAINEL_EMAIL;
  const senha = process.env.PAINEL_SENHA;
  const segredo = process.env.SEGREDO_DO_PAINEL;
  const token = obterCookie(req, "painel_token");

  if (!email || !senha || !segredo || !token) {
    return false;
  }

  const esperado = crypto
    .createHash("sha256")
    .update(email + senha + segredo)
    .digest("hex");

  if (
    token.length !== esperado.length ||
    !/^[a-f0-9]{64}$/i.test(token)
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(esperado)
  );
}

function texto(valor, limite) {
  return typeof valor === "string"
    ? valor.trim().slice(0, limite)
    : "";
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      sucesso: false,
      erro: "Método não permitido."
    });
  }

  // Envio de campanhas é exclusivo do painel administrativo.
  if (!sessaoValida(req)) {
    return res.status(401).json({
      sucesso: false,
      erro: "Sessão do painel não autorizada."
    });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({
      sucesso: false,
      erro: "Serviço de e-mail não configurado."
    });
  }

  try {
    const body = req.body || {};

    const empresa = texto(body.empresa, 150);
    const destinatario = texto(body.destinatario, 254);
    const assunto = texto(body.assunto, 300);
    const mensagem = texto(body.mensagem, 100000);
    const imagem = body.imagem;
    const imagemNome = texto(body.imagemNome, 200);

    if (
      !empresa ||
      !destinatario ||
      !assunto ||
      !mensagem
    ) {
      return res.status(400).json({
        sucesso: false,
        erro: "Empresa, destinatário, assunto e mensagem são obrigatórios."
      });
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)
    ) {
      return res.status(400).json({
        sucesso: false,
        erro: "Endereço de e-mail inválido."
      });
    }

    const remetentes = {
      "PR Plásticos Recicláveis":
        "PR Plásticos <comercial@prplasticos.com.br>",
      "Clean Recycling":
        "Clean Recycling <paulo.salles@cleanrecycling.com.br>",
      "MW Plastic":
        "MW Plastic <salles2249@gmail.com>",
      "CIC Plastic":
        "CIC Plastic <salles2249@gmail.com>",
      "MHC Plastic":
        "MHC Plastic <salles2249@gmail.com>"
    };

    if (!remetentes[empresa]) {
      return res.status(400).json({
        sucesso: false,
        erro: "Empresa não reconhecida."
      });
    }

    const email = {
      from: remetentes[empresa],
      to: destinatario,
      subject: assunto,
      html: mensagem
    };

    if (imagem != null && imagem !== "") {
      if (typeof imagem !== "string" || imagem.length > 7000000) {
        return res.status(400).json({
          sucesso: false,
          erro: "Imagem inválida ou muito grande."
        });
      }

      const correspondencia = imagem.match(
        /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/
      );

      if (!correspondencia) {
        return res.status(400).json({
          sucesso: false,
          erro: "A imagem deve estar em formato válido."
        });
      }

      const conteudo = Buffer.from(
        correspondencia[2].replace(/\s/g, ""),
        "base64"
      );

      if (!conteudo.length || conteudo.length > 5 * 1024 * 1024) {
        return res.status(400).json({
          sucesso: false,
          erro: "A imagem deve ter no máximo 5 MB."
        });
      }

      email.attachments = [{
        filename: imagemNome || "imagem-campanha",
        content: conteudo
      }];
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const resultado = await resend.emails.send(email);

    if (resultado.error) {
      console.error("Erro do Resend:", resultado.error);

      return res.status(502).json({
        sucesso: false,
        erro: resultado.error.message ||
          "O Resend não conseguiu enviar o e-mail."
      });
    }

    return res.status(200).json({
      sucesso: true,
      resultado
    });
  } catch (erro) {
    console.error("Erro ao enviar e-mail:", erro);

    return res.status(500).json({
      sucesso: false,
      erro: "Erro ao enviar o e-mail."
    });
  }
};
