const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      sucesso: false,
      erro: "Método não permitido"
    });
  }

  try {
    const {
      destinatario,
      assunto,
      mensagem,
      imagem,
      imagemNome
    } = req.body;

    if (!destinatario || !assunto || !mensagem) {
      return res.status(400).json({
        sucesso: false,
        erro: "Destinatário, assunto e mensagem são obrigatórios."
      });
    }

    const email = {
      from: "PR Plásticos <comercial@prplasticos.com.br>",
      to: destinatario,
      subject: assunto,
      html: mensagem
    };

    if (imagem) {
      email.attachments = [
        {
          filename: imagemNome || "imagem-campanha.png",
          content: imagem,
          content_id: "imagem-campanha"
        }
      ];
    }

    const resultado = await resend.emails.send(email);

    return res.status(200).json({
      sucesso: true,
      resultado
    });

  } catch (erro) {
    console.error(erro);

    return res.status(500).json({
      sucesso: false,
      erro: "Erro ao enviar o e-mail."
    });
  }
};
