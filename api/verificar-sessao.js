const crypto = require("crypto");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({
      autorizado: false,
      erro: "Método não permitido"
    });
  }

  try {
    const cookies = req.headers.cookie || "";

    const cookieToken = cookies
      .split(";")
      .map(cookie => cookie.trim())
      .find(cookie => cookie.startsWith("painel_token="));

    if (!cookieToken) {
      return res.status(401).json({
        autorizado: false
      });
    }

    const token = cookieToken.split("=")[1];

    const email = process.env.PAINEL_EMAIL;
    const senha = process.env.PAINEL_SENHA;
    const segredo = process.env["SEGREDO DO PAINEL"];

    if (!email || !senha || !segredo) {
      return res.status(500).json({
        autorizado: false,
        erro: "Configuração do painel incompleta."
      });
    }

    const tokenEsperado = crypto
      .createHash("sha256")
      .update(email + senha + segredo)
      .digest("hex");

    if (token !== tokenEsperado) {
      return res.status(401).json({
        autorizado: false
      });
    }

    return res.status(200).json({
      autorizado: true
    });

  } catch (erro) {
    console.error(erro);

    return res.status(500).json({
      autorizado: false,
      erro: "Erro interno no servidor."
    });
  }
};
