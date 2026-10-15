
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

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      autorizado: false,
      erro: "Método não permitido."
    });
  }

  try {
    const email = process.env.PAINEL_EMAIL;
    const senha = process.env.PAINEL_SENHA;
    const segredo = process.env.SEGREDO_DO_PAINEL;
    const token = obterCookie(req, "painel_token");

    if (!email || !senha || !segredo) {
      console.error(
        "Variáveis de ambiente do painel não configuradas."
      );

      return res.status(500).json({
        autorizado: false,
        erro: "Configuração do painel incompleta."
      });
    }

    if (!token) {
      return res.status(401).json({
        autorizado: false
      });
    }

    const tokenEsperado = crypto
      .createHash("sha256")
      .update(email + senha + segredo)
      .digest("hex");

    if (
      token.length !== tokenEsperado.length ||
      !/^[a-f0-9]{64}$/i.test(token) ||
      !crypto.timingSafeEqual(
        Buffer.from(token),
        Buffer.from(tokenEsperado)
      )
    ) {
      return res.status(401).json({
        autorizado: false
      });
    }

    return res.status(200).json({
      autorizado: true
    });
  } catch (erro) {
    console.error("Erro ao verificar sessão:", erro);

    return res.status(500).json({
      autorizado: false,
      erro: "Erro interno no servidor."
    });
  }
};
