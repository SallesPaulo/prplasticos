const crypto = require("crypto");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      sucesso: false,
      erro: "Método não permitido"
    });
  }

  try {
    const { email, senha } = req.body || {};

    if (!email || !senha) {
      return res.status(400).json({
        sucesso: false,
        erro: "E-mail e senha são obrigatórios."
      });
    }

    const emailCorreto = process.env.PAINEL_EMAIL;
    const senhaCorreta = process.env.PAINEL_SENHA;

    if (!emailCorreto || !senhaCorreta) {
      return res.status(500).json({
        sucesso: false,
        erro: "Login não configurado no servidor."
      });
    }

    if (email !== emailCorreto || senha !== senhaCorreta) {
      return res.status(401).json({
        sucesso: false,
        erro: "E-mail ou senha incorretos."
      });
    }

    const token = crypto
      .createHash("sha256")
      .update(email + senha + process.env.PAINEL_SECRET)
      .digest("hex");

    res.setHeader(
      "Set-Cookie",
      `painel_token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`
    );

    return res.status(200).json({
      sucesso: true
    });

  } catch (erro) {
    console.error(erro);

    return res.status(500).json({
      sucesso: false,
      erro: "Erro interno no servidor."
    });
  }
};
