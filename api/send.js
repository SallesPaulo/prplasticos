const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido"
    });
  }

  try {
    const { destinatario, assunto, mensagem } = req.body;

    if (!destinatario || !assunto || !mensagem) {
      return res.status(400).json({
        error: "Destinatário, assunto e mensagem são obrigatórios."
      });
    }

    const resultado = await resend.emails.send({
      from: "PR Plásticos <comercial@prplasticos.com.br>",
      to: destinatario,
      subject: assunto,
      html: mensagem
    });

    return res.status(200).json({
      sucesso: true,
      resultado
    });

  } catch (erro) {
    console.error(erro);

    return res.status(500).json({
      sucesso: false,
      error: "Erro ao enviar o e-mail."
    });
  }
};
