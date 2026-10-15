const { Resend } = require("resend");
const crypto = require("crypto");

function obterCookie(req, nome) {
  const cookies = req.headers.cookie || "";
  const item = cookies
    .split(";")
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(nome + "="));

  return item
    ? decodeURIComponent(item.substring(nome.length + 1))
    : null;
}

function sessaoValida(req) {
  const email = process.env.PAINEL_EMAIL;
  const senha = process.env.PAINEL_SENHA;
  const segredo = process.env.SEGREDO_DO_PAINEL;
  const token = obterCookie(req, "painel_token");

  if (!email || !senha || !segredo || !token) return false;

  const esperado = crypto
    .createHash("sha256")
    .update(email + senha + segredo)
    .digest("hex");

  if (token.length !== esperado.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(esperado)
  );
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      sucesso: false,
      erro: "Método não permitido."
    });
  }

  if (!sessaoValida(req)) {
    return res.status(401).json({
      sucesso: false,
      erro: "Sessão não autorizada."
    });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({
      sucesso: false,
      erro: "Serviço de e-mail não configurado."
    });
  }

  try {
    const {
      empresa,
      destinatario,
      assunto,
      mensagem,
      imagem,
      imagemNome
    } = req.body || {};

    if (
      !empresa ||
      !destinatario ||
      !assunto ||
      !mensagem
    ) {
      return res.status(400).json({
        sucesso: false,
        erro: "Destinatário, assunto e mensagem são obrigatórios."
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

    if (imagem) {
      email.attachments = [{
        filename: imagemNome || "imagem-campanha.png",
        content: imagem,
        contentId: "imagem-campanha"
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
